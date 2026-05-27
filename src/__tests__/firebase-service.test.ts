import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decodeTokenExpiry, isTokenExpired, FirebaseService } from '../services/firebase-service';

// ── Helpers to build fake JWTs ────────────────────────────────────────────────

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  const sig = 'fakesignature';
  return `${header}.${body}.${sig}`;
}

const nowSec = () => Math.floor(Date.now() / 1000);

// ── Mock vscode ───────────────────────────────────────────────────────────────

vi.mock('vscode', () => ({
  window: {
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInputBox: vi.fn(),
    showQuickPick: vi.fn(),
  },
  authentication: {
    getSession: vi.fn(),
  },
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
    dispose = vi.fn();
  },
  ExtensionContext: class {},
}));

// ── Mock firebase/auth ────────────────────────────────────────────────────────

const mockSignInWithCredential = vi.fn();
const mockSetPersistence = vi.fn().mockResolvedValue(undefined);
const mockOnAuthStateChanged = vi.fn().mockReturnValue(vi.fn());

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  GoogleAuthProvider: {
    credential: vi.fn(() => ({ providerId: 'google.com' })),
  },
  signInWithCredential: (...args: unknown[]) => mockSignInWithCredential(...args),
  setPersistence: (...args: unknown[]) => mockSetPersistence(...args),
  inMemoryPersistence: {},
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));

// ── decodeTokenExpiry ─────────────────────────────────────────────────────────

describe('decodeTokenExpiry', () => {
  it('returns the exp value from a valid JWT', () => {
    const exp = nowSec() + 3600;
    const token = makeJwt({ exp, iss: 'accounts.google.com' });
    expect(decodeTokenExpiry(token)).toBe(exp);
  });

  it('returns null when there is no exp claim', () => {
    const token = makeJwt({ iss: 'accounts.google.com' });
    expect(decodeTokenExpiry(token)).toBeNull();
  });

  it('returns null for a non-JWT string', () => {
    expect(decodeTokenExpiry('not-a-jwt')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeTokenExpiry('')).toBeNull();
  });
});

// ── isTokenExpired ────────────────────────────────────────────────────────────

describe('isTokenExpired', () => {
  it('returns false for a token expiring in the future', () => {
    const token = makeJwt({ exp: nowSec() + 3600 });
    expect(isTokenExpired(token)).toBe(false);
  });

  it('returns true for an already-expired token', () => {
    const token = makeJwt({ exp: nowSec() - 10 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns true for a token expiring within the 30-second safety buffer', () => {
    const token = makeJwt({ exp: nowSec() + 20 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('returns false for a token with no exp claim', () => {
    const token = makeJwt({ iss: 'accounts.google.com' });
    expect(isTokenExpired(token)).toBe(false);
  });
});

// ── FirebaseService.restoreSession ────────────────────────────────────────────

describe('FirebaseService.restoreSession', () => {
  let service: FirebaseService;
  const fakeContext = {
    globalState: { get: vi.fn(), update: vi.fn() },
    secrets: { get: vi.fn(), store: vi.fn() },
    subscriptions: [],
  } as unknown as import('vscode').ExtensionContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockOnAuthStateChanged.mockReturnValue(vi.fn());
    service = new FirebaseService(fakeContext);
    await service.initialize();
  });

  it('returns false when no session exists', async () => {
    const vscode = await import('vscode');
    vi.mocked(vscode.authentication.getSession).mockResolvedValue(undefined as never);
    const result = await service.restoreSession();
    expect(result).toBe(false);
  });

  it('returns false without calling signInWithCredential when the stored token is expired', async () => {
    const expiredToken = makeJwt({ exp: nowSec() - 100, iss: 'https://accounts.google.com' });
    const vscode = await import('vscode');
    vi.mocked(vscode.authentication.getSession).mockResolvedValue({
      id: 'sess1',
      accessToken: expiredToken,
      account: { id: 'sub123', label: 'test@example.com' },
      scopes: ['email'],
    });
    const result = await service.restoreSession();
    expect(result).toBe(false);
    expect(mockSignInWithCredential).not.toHaveBeenCalled();
  });

  it('calls signInWithCredential and returns true for a fresh token', async () => {
    const freshToken = makeJwt({ exp: nowSec() + 3600, iss: 'https://accounts.google.com' });
    const vscode = await import('vscode');
    vi.mocked(vscode.authentication.getSession).mockResolvedValue({
      id: 'sess1',
      accessToken: freshToken,
      account: { id: 'sub123', label: 'test@example.com' },
      scopes: ['email'],
    });
    mockSignInWithCredential.mockResolvedValue({
      user: { email: 'test@example.com', uid: 'uid123' },
    });

    const result = await service.restoreSession();
    expect(result).toBe(true);
    expect(mockSignInWithCredential).toHaveBeenCalledOnce();
  });
});

// ── FirebaseService.signInWithGoogle — retry on invalid credential ────────────

describe('FirebaseService.signInWithGoogle', () => {
  let service: FirebaseService;
  const fakeContext = {
    globalState: { get: vi.fn(), update: vi.fn() },
    secrets: { get: vi.fn(), store: vi.fn() },
    subscriptions: [],
  } as unknown as import('vscode').ExtensionContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockOnAuthStateChanged.mockReturnValue(vi.fn());
    service = new FirebaseService(fakeContext);
    await service.initialize();
  });

  it('forces a new session when the cached token is expired', async () => {
    const expiredToken = makeJwt({ exp: nowSec() - 100, iss: 'https://accounts.google.com' });
    const freshToken = makeJwt({ exp: nowSec() + 3600, iss: 'https://accounts.google.com' });
    const vscode = await import('vscode');

    // First call returns expired token; second call (forceNewSession) returns fresh token
    vi.mocked(vscode.authentication.getSession)
      .mockResolvedValueOnce({
        id: 'sess-old',
        accessToken: expiredToken,
        account: { id: 'sub', label: 'test@example.com' },
        scopes: ['email'],
      })
      .mockResolvedValueOnce({
        id: 'sess-new',
        accessToken: freshToken,
        account: { id: 'sub', label: 'test@example.com' },
        scopes: ['email'],
      });

    mockSignInWithCredential.mockResolvedValue({
      user: { email: 'test@example.com', uid: 'uid123' },
    });

    await service.signInWithGoogle();

    // getSession should be called twice: once without forceNewSession, once with
    expect(vscode.authentication.getSession).toHaveBeenCalledTimes(2);
    const firstOpts = vi.mocked(vscode.authentication.getSession).mock.calls[0][2] as Record<string, unknown>;
    const secondOpts = vi.mocked(vscode.authentication.getSession).mock.calls[1][2] as Record<string, unknown>;
    // First call: normal createIfNone, no forceNewSession
    expect(firstOpts.forceNewSession).toBeFalsy();
    // Second call: forceNewSession=true, createIfNone must NOT be present (VS Code rejects the combination)
    expect(secondOpts.forceNewSession).toBe(true);
    expect(secondOpts.createIfNone).toBeUndefined();
    expect(mockSignInWithCredential).toHaveBeenCalledOnce();
  });

  it('retries with forceNewSession when signInWithCredential returns auth/invalid-credential', async () => {
    const freshToken = makeJwt({ exp: nowSec() + 3600, iss: 'https://accounts.google.com' });
    const freshToken2 = makeJwt({ exp: nowSec() + 3600, iss: 'https://accounts.google.com' });
    const vscode = await import('vscode');

    vi.mocked(vscode.authentication.getSession)
      .mockResolvedValueOnce({
        id: 'sess1', accessToken: freshToken,
        account: { id: 'sub', label: 'x@x.com' }, scopes: ['email'],
      })
      .mockResolvedValueOnce({
        id: 'sess2', accessToken: freshToken2,
        account: { id: 'sub', label: 'x@x.com' }, scopes: ['email'],
      });

    const authError = Object.assign(new Error('Invalid credential'), { code: 'auth/invalid-credential' });
    mockSignInWithCredential
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce({ user: { email: 'x@x.com', uid: 'uid1' } });

    await service.signInWithGoogle();

    expect(mockSignInWithCredential).toHaveBeenCalledTimes(2);
    // The retry call must use forceNewSession without createIfNone
    const retryOpts = vi.mocked(vscode.authentication.getSession).mock.calls[1][2] as Record<string, unknown>;
    expect(retryOpts.forceNewSession).toBe(true);
    expect(retryOpts.createIfNone).toBeUndefined();
  });
});
