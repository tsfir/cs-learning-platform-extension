import * as vscode from 'vscode';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  setPersistence,
  inMemoryPersistence,
  type Auth,
  type User,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  arrayUnion,
  serverTimestamp,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  type FirebaseStorage,
} from 'firebase/storage';
import type { Course, Topic, Lesson, Section, UserProgress, StudentAnswer, InputMetrics } from '../models';

/**
 * Decode the JWT payload and return the expiry timestamp (seconds), or null if unreadable.
 * Does NOT verify the signature — only used to check whether the cached token is stale.
 */
export function decodeTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8')) as { exp?: number };
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns true if the JWT has expired (or expires within 30 s — a safe clock-skew buffer).
 */
export function isTokenExpired(token: string): boolean {
  const exp = decodeTokenExpiry(token);
  if (exp === null) return false;
  return Date.now() / 1000 > exp - 30;
}

export class FirebaseService {
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;
  private db: Firestore | null = null;
  private storage: FirebaseStorage | null = null;
  private authListeners: Unsubscribe[] = [];
  private hadUser = false;

  constructor(private context: vscode.ExtensionContext) { }

  async initialize(): Promise<void> {
    const firebaseConfig = {
      apiKey: "AIzaSyAj5aDlKy8bX4AaYzqYRzlWr2odIoedstg",
      authDomain: "easycslearning-web-app.firebaseapp.com",
      projectId: "easycslearning-web-app",
      storageBucket: "easycslearning-web-app.firebasestorage.app",
      messagingSenderId: "759882252483",
      appId: "1:759882252483:web:03552e3d108ddfc487a276"
    };

    this.app = initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
    this.db = getFirestore(this.app);
    this.storage = getStorage(this.app);

    try {
      await setPersistence(this.auth, inMemoryPersistence);
      console.log('[FirebaseService] Auth persistence set to inMemoryPersistence');
    } catch (error) {
      console.error('[FirebaseService] Failed to set auth persistence:', error);
    }

    const unsubscribe = onAuthStateChanged(this.auth, (user) => {
      this.handleAuthStateChanged(user);
    });
    this.authListeners.push(unsubscribe);
  }

  private handleAuthStateChanged(user: User | null) {
    if (user) {
      this.hadUser = true;
      vscode.window.showInformationMessage(`Signed in as ${user.email}`);
      this.context.globalState.update('userId', user.uid);
      this.context.globalState.update('userEmail', user.email);
    } else {
      if (this.hadUser) {
        vscode.window.showWarningMessage('Not signed in to CS Learning Platform');
      }
      this.hadUser = false;
      this.context.globalState.update('userId', undefined);
      this.context.globalState.update('userEmail', undefined);
    }
    this._onAuthStateChanged.fire(user);
  }

  private _onAuthStateChanged = new vscode.EventEmitter<User | null>();
  public readonly onAuthStateChanged = this._onAuthStateChanged.event;

  async signInWithGoogle(): Promise<void> {
    try {
      console.log('[FirebaseService] signInWithGoogle: requesting session...');

      let session = await vscode.authentication.getSession(
        'firebase-google',
        ['email', 'profile'],
        { createIfNone: true }
      );

      if (!session) {
        console.log('[FirebaseService] signInWithGoogle: no session returned');
        return;
      }

      // If the cached token is already expired, force a fresh browser sign-in
      if (isTokenExpired(session.accessToken)) {
        console.log('[FirebaseService] signInWithGoogle: cached token is expired — forcing fresh sign-in');
        session = await vscode.authentication.getSession(
          'firebase-google',
          ['email', 'profile'],
          { forceNewSession: true }
        );
        if (!session) {
          console.log('[FirebaseService] signInWithGoogle: fresh session not obtained');
          return;
        }
      }

      await this.signInWithSession(session);
    } catch (error: any) {
      console.error('[FirebaseService] signInWithGoogle error:', error.code, error.message);

      // If Firebase rejected the credential (e.g. token still cached but for wrong project),
      // force a completely fresh session and retry once.
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-token-expired') {
        console.log('[FirebaseService] signInWithGoogle: invalid credential — forcing new session and retrying');
        try {
          const freshSession = await vscode.authentication.getSession(
            'firebase-google',
            ['email', 'profile'],
            { forceNewSession: true }
          );
          if (freshSession) {
            await this.signInWithSession(freshSession);
            return;
          }
        } catch (retryError: any) {
          console.error('[FirebaseService] Retry sign-in also failed:', retryError.code, retryError.message);
          vscode.window.showErrorMessage(`Google sign in failed: ${retryError.message || 'Unknown error'}`);
          throw retryError;
        }
      }

      if (error.message === 'User cancelled') {
        vscode.window.showWarningMessage('Sign in cancelled');
      } else {
        vscode.window.showErrorMessage(`Google sign in failed: ${error.message || 'Unknown error'}`);
      }
      throw error;
    }
  }

  /**
   * Try to restore an existing session silently (called on extension startup).
   */
  async restoreSession(): Promise<boolean> {
    try {
      const session = await vscode.authentication.getSession(
        'firebase-google',
        ['email', 'profile'],
        { createIfNone: false }
      );

      if (!session) {
        console.log('[FirebaseService] restoreSession: no stored session found');
        return false;
      }

      // Skip restore if the Google ID token is already expired; the user will
      // need to sign in again to get a fresh token.
      if (isTokenExpired(session.accessToken)) {
        console.log('[FirebaseService] restoreSession: stored token is expired — skipping restore');
        return false;
      }

      console.log('[FirebaseService] restoreSession: valid session found, restoring...');
      await this.signInWithSession(session);
      return true;
    } catch (error) {
      console.error('[FirebaseService] restoreSession failed:', error);
      return false;
    }
  }

  private async signInWithSession(session: vscode.AuthenticationSession): Promise<void> {
    const token = session.accessToken;

    // ── Diagnostic logging (no sensitive data leaked — only metadata) ──────────
    console.log('[FirebaseService] signInWithSession: token length =', token.length);
    console.log('[FirebaseService] signInWithSession: token prefix =', token.substring(0, 20) + '...');

    const parts = token.split('.');
    console.log('[FirebaseService] signInWithSession: JWT parts count =', parts.length, '(expected 3)');

    if (parts.length === 3) {
      try {
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64').toString('utf8')
        ) as { iss?: string; aud?: string; email?: string; exp?: number; sub?: string };

        console.log('[FirebaseService] signInWithSession: token.iss =', payload.iss);
        console.log('[FirebaseService] signInWithSession: token.aud =', payload.aud);
        console.log('[FirebaseService] signInWithSession: token.email =', payload.email);
        console.log('[FirebaseService] signInWithSession: token.sub (Google UID) =', payload.sub);

        if (payload.exp) {
          const expDate = new Date(payload.exp * 1000);
          const nowSec = Date.now() / 1000;
          const remainingSec = Math.round(payload.exp - nowSec);
          console.log('[FirebaseService] signInWithSession: token.exp =', expDate.toISOString(),
            '| seconds remaining =', remainingSec);
        }
      } catch (e) {
        console.warn('[FirebaseService] signInWithSession: could not decode token payload —', e);
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    console.log('[FirebaseService] signInWithSession: calling signInWithCredential...');
    const credential = GoogleAuthProvider.credential(token);
    const userCredential = await signInWithCredential(this.auth!, credential);
    const user = userCredential.user;

    console.log('[FirebaseService] signInWithSession: signed in as', user.email, '| uid =', user.uid);

    this.context.globalState.update('userId', user.uid);
    this.context.globalState.update('userEmail', user.email);
  }

  async signInWithEmailPassword(): Promise<void> {
    const email = await vscode.window.showInputBox({
      prompt: 'Enter your CS Learning Platform email',
      placeHolder: 'user@example.com',
    });
    if (!email) return;

    const password = await vscode.window.showInputBox({
      prompt: 'Enter your password',
      password: true,
    });
    if (!password) return;

    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      await signInWithEmailAndPassword(this.auth!, email, password);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Sign in failed: ${error.message || 'Unknown error'}`);
      throw error;
    }
  }

  async signIn(): Promise<void> {
    const method = await vscode.window.showQuickPick(
      [
        { label: 'Sign in with Google', value: 'google' },
        { label: 'Sign in with Email/Password', value: 'email' },
      ],
      { placeHolder: 'Choose sign-in method' }
    );
    if (!method) return;
    if (method.value === 'google') {
      await this.signInWithGoogle();
    } else {
      await this.signInWithEmailPassword();
    }
  }

  async signOut(): Promise<void> {
    await this.auth?.signOut();
    vscode.window.showInformationMessage('Signed out from CS Learning Platform');
  }

  getCurrentUser(): User | null {
    return this.auth?.currentUser || null;
  }

  getUserId(): string | undefined {
    return this.context.globalState.get<string>('userId');
  }

  // ── Firestore operations ────────────────────────────────────────────────────

  async getCourse(courseId: string): Promise<Course | null> {
    const docRef = doc(this.db!, 'courses', courseId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Course : null;
  }

  async getTopics(courseId: string): Promise<Topic[]> {
    const q = query(
      collection(this.db!, 'topics'),
      where('courseId', '==', courseId),
      orderBy('orderIndex', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Topic));
  }

  async getTopic(topicId: string): Promise<Topic | null> {
    const docRef = doc(this.db!, 'topics', topicId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Topic : null;
  }

  async getLessons(topicId: string): Promise<Lesson[]> {
    const q = query(
      collection(this.db!, 'lessons'),
      where('topicId', '==', topicId),
      orderBy('orderIndex', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Lesson));
  }

  async getLesson(lessonId: string): Promise<Lesson | null> {
    const docRef = doc(this.db!, 'lessons', lessonId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as Lesson : null;
  }

  async getSections(lessonId: string): Promise<Section[]> {
    const q = query(
      collection(this.db!, 'sections'),
      where('lessonId', '==', lessonId)
    );
    const snapshot = await getDocs(q);
    const sections = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Section));
    return sections.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async getStudentAnswer(sectionId: string, userId: string): Promise<StudentAnswer | null> {
    const q = query(
      collection(this.db!, 'studentAnswers'),
      where('sectionId', '==', sectionId),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as StudentAnswer;
  }

  async saveStudentAnswer(
    sectionId: string,
    userId: string,
    lessonId: string,
    content: string,
    type: 'code' | 'interactive' = 'code',
    courseId?: string,
    inputMetrics?: InputMetrics
  ): Promise<void> {
    const q = query(
      collection(this.db!, 'studentAnswers'),
      where('sectionId', '==', sectionId),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      const updateData: Record<string, unknown> = { answer: content, updatedAt: serverTimestamp() };
      if (inputMetrics) updateData.inputMetrics = inputMetrics;
      await updateDoc(docRef, updateData);
    } else {
      const data: Record<string, unknown> = {
        sectionId, userId, lessonId,
        answer: content, type,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      };
      if (courseId) data.courseId = courseId;
      if (inputMetrics) data.inputMetrics = inputMetrics;
      await addDoc(collection(this.db!, 'studentAnswers'), data);
    }
  }

  subscribeToLesson(lessonId: string, callback: (sections: Section[]) => void): Unsubscribe {
    const q = query(collection(this.db!, 'sections'), where('lessonId', '==', lessonId));
    return onSnapshot(q, (snapshot) => {
      const sections = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Section))
        .sort((a, b) => a.orderIndex - b.orderIndex);
      callback(sections);
    });
  }

  subscribeToUserProgress(
    userId: string,
    courseId: string,
    callback: (progress: UserProgress | null) => void
  ): Unsubscribe {
    const progressId = `${userId}_${courseId}`;
    const docRef = doc(this.db!, 'userProgress', progressId);
    return onSnapshot(docRef, (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data() as UserProgress) : null);
    });
  }

  async submitExerciseCode(
    userId: string,
    lessonId: string,
    exerciseId: string,
    code: string,
    language: string
  ): Promise<void> {
    const submissionRef = doc(
      collection(this.db!, 'codeSubmissions'),
      `${userId}_${lessonId}_${exerciseId}`
    );
    await setDoc(submissionRef, {
      userId, lessonId, exerciseId, code, language,
      submittedAt: new Date().toISOString(),
      source: 'vscode',
    }, { merge: true });
  }

  async uploadFile(path: string, file: Buffer, metadata?: Record<string, string>): Promise<string> {
    const storageRef = ref(this.storage!, path);
    await uploadBytes(storageRef, file, metadata);
    return await getDownloadURL(storageRef);
  }

  async saveStudentGrade(
    lessonId: string,
    sectionId: string,
    userId: string,
    grade: number,
    feedback: string,
    maxPoints?: number
  ): Promise<void> {
    try {
      const now = new Date().toISOString();

      // ── 1. Persist grade + aiFeedback on studentAnswers ──────────────────
      const answersRef = collection(this.db!, 'studentAnswers');
      const q = query(
        answersRef,
        where('lessonId', '==', lessonId),
        where('sectionId', '==', sectionId),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        await updateDoc(snapshot.docs[0].ref, {
          grade, aiFeedback: feedback, updatedAt: now,
        });
      } else {
        await addDoc(answersRef, {
          lessonId, sectionId, userId, grade, aiFeedback: feedback,
          createdAt: now, updatedAt: now,
        });
      }

      // ── 2. Write feedback as assistant message to aiChats ────────────────
      const pct = maxPoints ? Math.round((grade / maxPoints) * 100) : null;
      const chatMessage = {
        role: 'assistant',
        content: pct != null
          ? `**ציון: ${grade}/${maxPoints} (${pct}%)**\n\n${feedback}`
          : feedback,
        timestamp: now,
      };

      const chatSnap = await getDocs(query(
        collection(this.db!, 'aiChats'),
        where('userId', '==', userId),
        where('lessonId', '==', lessonId)
      ));

      if (chatSnap.empty) {
        await addDoc(collection(this.db!, 'aiChats'), {
          userId, lessonId,
          messages: [chatMessage],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(chatSnap.docs[0].ref, {
          messages: arrayUnion(chatMessage),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('[FirebaseService] Error saving grade:', error);
      throw error;
    }
  }

  // ── System prompts (session cache) ─────────────────────────────────────────

  private readonly _promptCache = new Map<string, string>();

  /**
   * Return the system prompt for `id` from Firestore.
   * Reads at most once per session; falls back to the provided default on error.
   */
  async getSystemPrompt(id: string, fallback: string): Promise<string> {
    if (this._promptCache.has(id)) return this._promptCache.get(id)!;
    try {
      const snap = await getDoc(doc(this.db!, 'systemPrompts', id));
      if (snap.exists()) {
        const content = (snap.data()?.content as string | undefined)?.trim() ?? '';
        if (content) {
          this._promptCache.set(id, content);
          return content;
        }
      }
    } catch (e) {
      console.warn(`[FirebaseService] Could not fetch system prompt "${id}" — using fallback.`, e);
    }
    return fallback;
  }

  dispose() {
    this.authListeners.forEach((unsubscribe) => unsubscribe());
  }
}
