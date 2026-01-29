import * as vscode from 'vscode';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithCustomToken,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  indexedDBLocalPersistence,
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
import type { Course, Topic, Lesson, Section, UserProgress, StudentAnswer } from '../models';

export class FirebaseService {
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;
  private db: Firestore | null = null;
  private storage: FirebaseStorage | null = null;
  private authListeners: Unsubscribe[] = [];

  constructor(private context: vscode.ExtensionContext) {}

  async initialize(): Promise<void> {
    // Firebase config from web app
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

    // Set persistence to keep auth state across VS Code restarts and workspace changes
    try {
      await setPersistence(this.auth, indexedDBLocalPersistence);
      console.log('Firebase auth persistence enabled');
    } catch (error) {
      console.error('Failed to set auth persistence:', error);
    }

    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(this.auth, (user) => {
      this.handleAuthStateChanged(user);
    });
    this.authListeners.push(unsubscribe);
  }

  private handleAuthStateChanged(user: User | null) {
    if (user) {
      vscode.window.showInformationMessage(
        `Signed in as ${user.email}`
      );
      // Store user info in global state (persists across workspaces)
      this.context.globalState.update('userId', user.uid);
      this.context.globalState.update('userEmail', user.email);
    } else {
      vscode.window.showWarningMessage('Not signed in to CS Learning Platform');
      this.context.globalState.update('userId', undefined);
      this.context.globalState.update('userEmail', undefined);
    }
  }

  async signInWithGoogle(): Promise<void> {
    try {
      // For VS Code extensions, popup-based OAuth doesn't work
      // We'll guide users to sign in via web app with Google,
      // then use email/password in the extension

      const choice = await vscode.window.showInformationMessage(
        'Google Sign-In requires opening the web app. Would you like to continue?',
        'Open Web App',
        'Use Email/Password Instead',
        'Cancel'
      );

      if (choice === 'Open Web App') {
        // Open the web app login page
        await vscode.env.openExternal(
          vscode.Uri.parse('https://easycslearning-web-app.firebaseapp.com/login')
        );

        vscode.window.showInformationMessage(
          'After signing in with Google on the web:\n' +
          '1. Create an email/password in Settings (if you haven\'t)\n' +
          '2. Return here and use "Sign in with Email/Password"\n\n' +
          'This limitation will be fixed in a future update.',
          'Got it'
        );
      } else if (choice === 'Use Email/Password Instead') {
        // Fall back to email/password
        await this.signInWithEmailPassword();
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Sign in failed: ${error.message || 'Unknown error'}`
      );
      throw error;
    }
  }

  async signInWithEmailPassword(): Promise<void> {
    const email = await vscode.window.showInputBox({
      prompt: 'Enter your CS Learning Platform email',
      placeHolder: 'user@example.com',
    });

    if (!email) {
      return;
    }

    const password = await vscode.window.showInputBox({
      prompt: 'Enter your password',
      password: true,
    });

    if (!password) {
      return;
    }

    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      await signInWithEmailAndPassword(this.auth!, email, password);
      vscode.window.showInformationMessage('Successfully signed in!');
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Sign in failed: ${error.message || 'Unknown error'}`
      );
      throw error;
    }
  }

  async signIn(): Promise<void> {
    // Show quick pick for sign-in method
    const method = await vscode.window.showQuickPick(
      [
        { label: 'Sign in with Google', value: 'google' },
        { label: 'Sign in with Email/Password', value: 'email' },
      ],
      {
        placeHolder: 'Choose sign-in method',
      }
    );

    if (!method) {
      return;
    }

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

  // Firestore operations
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
    const sections = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Section));
    return sections.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  /**
   * Get student answer for a specific section
   */
  async getStudentAnswer(sectionId: string, userId: string): Promise<StudentAnswer | null> {
    const q = query(
      collection(this.db!, 'studentAnswers'),
      where('sectionId', '==', sectionId),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as StudentAnswer;
  }

  // Real-time listeners
  subscribeToLesson(
    lessonId: string,
    callback: (sections: Section[]) => void
  ): Unsubscribe {
    const q = query(
      collection(this.db!, 'sections'),
      where('lessonId', '==', lessonId)
    );
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
      if (snapshot.exists()) {
        callback(snapshot.data() as UserProgress);
      } else {
        callback(null);
      }
    });
  }

  // Submit exercise code
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

    await setDoc(
      submissionRef,
      {
        userId,
        lessonId,
        exerciseId,
        code,
        language,
        submittedAt: new Date().toISOString(),
        source: 'vscode',
      },
      { merge: true }
    );
  }

  // Upload file to Storage
  async uploadFile(
    path: string,
    file: Buffer,
    metadata?: Record<string, string>
  ): Promise<string> {
    const storageRef = ref(this.storage!, path);
    await uploadBytes(storageRef, file, metadata);
    return await getDownloadURL(storageRef);
  }

  dispose() {
    this.authListeners.forEach((unsubscribe) => unsubscribe());
  }
}
