import * as vscode from 'vscode';
import { v4 as uuid } from 'uuid';

const SESSIONS_SECRET_KEY = 'cs-learning-platform.sessions';
const AUTH_TYPE = 'firebase-google';
const AUTH_NAME = 'CS Learning Platform';

/**
 * Authentication Flow Explanation:
 * 
 * 1. User clicks "Sign in" in VS Code.
 * 2. Extension opens the Web App URL (VSCodeAuth.tsx) in default browser.
 * 3. User signs in with Google on the Web App (client-side).
 * 4. Web App gets the Google ID Token (IdP token) from credentailFromResult.
 * 5. Web App redirects back to vscode:// schemas with the token.
 * 6. Extension (UriHandler) receives the token.
 * 7. Extension (FirebaseAuthenticationProvider) validates the Google ID Token via Google API.
 * 8. Extension creates a VS Code Session.
 * 9. FirebaseService uses this Google ID Token to `signInWithCredential` in the internal Firebase SDK.
 * 
 * Mismatch Note: 
 * - The session stores the Google Subject ID (sub) as the account ID.
 * - However, FirebaseService will generate/retrieve a DIFFERENT Firebase UID after sign in.
 * - We must use the Firebase UID for all database operations, NOT the session ID.
 */

interface FirebaseSession {
  id: string;
  accessToken: string;
  account: {
    id: string;
    label: string;
  };
  scopes: string[];
}

class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
  public handleUri(uri: vscode.Uri) {
    this.fire(uri);
  }
}

export class FirebaseAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
  private _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  private _disposable: vscode.Disposable;
  private _pendingStates: string[] = [];
  private _codeExchangePromises = new Map<string, { promise: Promise<string>; cancel: vscode.EventEmitter<void> }>();
  private _uriHandler = new UriEventHandler();

  constructor(private readonly context: vscode.ExtensionContext) {
    this._disposable = vscode.Disposable.from(
      vscode.authentication.registerAuthenticationProvider(AUTH_TYPE, AUTH_NAME, this, { supportsMultipleAccounts: false }),
      vscode.window.registerUriHandler(this._uriHandler)
    );
  }

  get onDidChangeSessions() {
    return this._sessionChangeEmitter.event;
  }

  /**
   * Get existing sessions
   */
  public async getSessions(scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]> {
    const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);

    if (allSessions) {
      const sessions = JSON.parse(allSessions) as FirebaseSession[];
      return sessions.map(session => ({
        id: session.id,
        accessToken: session.accessToken,
        account: session.account,
        scopes: session.scopes || Array.from(scopes || [])
      }));
    }

    return [];
  }

  /**
   * Create a new authentication session
   */
  public async createSession(scopes: string[]): Promise<vscode.AuthenticationSession> {
    try {
      const token = await this.login(scopes);

      if (!token) {
        throw new Error('Login failed');
      }

      // Verify token with Firebase and get user info
      const userInfo = await this.getUserInfo(token);

      const session: FirebaseSession = {
        id: uuid(),
        accessToken: token,
        account: {
          id: userInfo.uid,
          label: userInfo.email || userInfo.displayName || 'User',
        },
        scopes,
      };

      await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify([session]));

      this._sessionChangeEmitter.fire({
        added: [session],
        removed: [],
        changed: [],
      });

      return session;
    } catch (e) {
      vscode.window.showErrorMessage(`Sign in failed: ${e}`);
      throw e;
    }
  }

  /**
   * Remove an existing session
   */
  public async removeSession(sessionId: string): Promise<void> {
    const allSessions = await this.context.secrets.get(SESSIONS_SECRET_KEY);
    if (allSessions) {
      const sessions = JSON.parse(allSessions) as FirebaseSession[];
      const sessionIdx = sessions.findIndex((s) => s.id === sessionId);
      const session = sessions[sessionIdx];
      sessions.splice(sessionIdx, 1);

      await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(sessions));

      if (session) {
        this._sessionChangeEmitter.fire({
          added: [],
          removed: [session],
          changed: [],
        });
      }
    }
  }

  /**
   * Handle the login process
   */
  private async login(scopes: string[] = []): Promise<string> {
    return await vscode.window.withProgress<string>(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Signing in to CS Learning Platform...',
        cancellable: true,
      },
      async (_, token) => {
        const stateId = uuid();
        this._pendingStates.push(stateId);

        // Get redirect URI from VS Code
        const redirectUri = await vscode.env.asExternalUri(
          vscode.Uri.parse(`${vscode.env.uriScheme}://RonTopol.easy-cs-learning-platform/auth-callback`)
        );

        // Construct Firebase Auth URL
        // This URL should point to your Firebase web app's login page
        // The web app will handle Google OAuth and redirect back with the token
        const authUrl = `https://easycslearning-web-app.firebaseapp.com/vscode-auth?state=${stateId}&redirect_uri=${encodeURIComponent(redirectUri.toString())}`;

        const scopeString = scopes.join(' ');

        await vscode.env.openExternal(vscode.Uri.parse(authUrl));

        // Set up promise for code exchange
        let codeExchangePromise = this.waitForAuthCode(stateId, token);
        this._codeExchangePromises.set(stateId, codeExchangePromise);

        try {
          return await Promise.race([
            codeExchangePromise.promise,
            new Promise<string>((_, reject) =>
              setTimeout(() => reject('Cancelled'), 60000)
            ),
          ]);
        } finally {
          this._pendingStates = this._pendingStates.filter((s) => s !== stateId);
          this._codeExchangePromises.delete(stateId);
        }
      }
    );
  }

  /**
   * Wait for the OAuth callback with the auth code
   */
  private waitForAuthCode(
    stateId: string,
    token: vscode.CancellationToken
  ): { promise: Promise<string>; cancel: vscode.EventEmitter<void> } {
    const cancelEmitter = new vscode.EventEmitter<void>();

    const promise = new Promise<string>((resolve, reject) => {
      const disposable = this._uriHandler.event((uri: vscode.Uri) => {
        const query = new URLSearchParams(uri.query);
        const state = query.get('state');
        const authToken = query.get('token');

        if (state === stateId) {
          if (authToken) {
            resolve(authToken);
          } else {
            reject(new Error('No token received'));
          }
          disposable.dispose();
        }
      });

      token.onCancellationRequested(() => {
        reject('User cancelled');
        disposable.dispose();
      });

      cancelEmitter.event(() => {
        reject('Cancelled');
        disposable.dispose();
      });
    });

    return { promise, cancel: cancelEmitter };
  }

  /**
   * Get user info from Google ID Token
   * 
   * We verify the token against Google's OAuth2 API because we are receiving
   * a Google ID Token (from the web app), not a Firebase ID Token.
   * 
   * This token is then used by FirebaseService to sign in via signInWithCredential.
   */
  private async getUserInfo(token: string): Promise<{ uid: string; email?: string; displayName?: string }> {
    try {
      console.log('[FirebaseAuth] Verifying Google ID Token...');

      // Verify Google ID Token
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${token}`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[FirebaseAuth] Token verification failed:', errorText);
        throw new Error(`Token verification failed: ${response.statusText}`);
      }

      const data: any = await response.json();
      console.log('[FirebaseAuth] Token verified for:', data.email);

      // Map Google profile to session account
      // Note: data.sub is the Google UID, not Firebase UID.
      // The actual Firebase sign-in happens in FirebaseService.
      return {
        uid: data.sub,
        email: data.email,
        displayName: data.name,
      };
    } catch (error) {
      console.error('[FirebaseAuth] Failed to get user info:', error);
      throw error;
    }
  }

  /**
   * Dispose the authentication provider
   */
  public dispose() {
    this._disposable.dispose();
  }
}
