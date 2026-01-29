import * as vscode from 'vscode';
import { v4 as uuid } from 'uuid';

const SESSIONS_SECRET_KEY = 'cs-learning-platform.sessions';
const AUTH_TYPE = 'firebase-google';
const AUTH_NAME = 'CS Learning Platform';

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
          vscode.Uri.parse(`${vscode.env.uriScheme}://cs-learning-platform.cs-learning-platform/auth-callback`)
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
   * Get user info from Firebase token
   */
  private async getUserInfo(token: string): Promise<{ uid: string; email?: string; displayName?: string }> {
    try {
      // Call Firebase Auth REST API to verify token and get user info
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyAj5aDlKy8bX4AaYzqYRzlWr2odIoedstg`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            idToken: token,
          }),
        }
      );

      const data: any = await response.json();

      if (data.users && data.users.length > 0) {
        const user = data.users[0];
        return {
          uid: user.localId,
          email: user.email,
          displayName: user.displayName,
        };
      } else {
        throw new Error('Invalid token');
      }
    } catch (error) {
      console.error('Failed to get user info:', error);
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
