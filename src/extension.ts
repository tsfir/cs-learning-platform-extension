import * as vscode from 'vscode';
import { FirebaseService } from './services/firebase-service';
import { WorkspaceManager } from './managers/workspace-manager';
import { CourseTreeProvider } from './providers/course-tree-provider';
import { FirebaseAuthenticationProvider } from './auth/firebase-auth-provider';
import { LessonWebviewProvider } from './providers/lesson-webview-provider';
import { OakleyChatParticipant } from './chat/oakley-participant';
import { GeminiService } from './services/gemini-service';
import { FileSyncManager } from './sync/file-sync-manager';
import * as path from 'path';
import * as fs from 'fs/promises'; // for reading exercise file

export async function activate(context: vscode.ExtensionContext) {
  console.log('CS Learning Platform extension is now active!');

  // Register Firebase authentication provider
  const authProvider = new FirebaseAuthenticationProvider(context);
  context.subscriptions.push(authProvider);

  // Initialize Firebase
  const firebaseService = new FirebaseService(context);

  try {
    await firebaseService.initialize();
    console.log('Firebase initialized successfully');
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to initialize Firebase: ${error}`
    );
    return;
  }

  // Initialize workspace manager
  const workspaceManager = new WorkspaceManager(context, firebaseService);

  // Initialize Gemini Service
  const geminiService = new GeminiService(context);

  // Initialize Chat Participant
  const chatParticipant = new OakleyChatParticipant(context, geminiService, firebaseService);
  chatParticipant.register();

  // Initialize sync manager (persistent)
  const fileSyncManager = new FileSyncManager(firebaseService, workspaceManager);

  // Initialize course tree provider
  const courseTreeProvider = new CourseTreeProvider(firebaseService, workspaceManager);

  // Register tree view
  const treeView = vscode.window.createTreeView('csLearningPlatform.coursesView', {
    treeDataProvider: courseTreeProvider,
  });
  context.subscriptions.push(treeView);

  // Register Webview Provider
  const lessonProvider = new LessonWebviewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      LessonWebviewProvider.viewType,
      lessonProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Register commands
  registerCommands(context, firebaseService, workspaceManager, courseTreeProvider, lessonProvider, chatParticipant, fileSyncManager);

  // Hook into document save events to trigger manual syncs (more reliable than file watcher)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      if (document.fileName.includes('exercise_')) {
        console.log(`[Extension] Document saved: ${document.fileName}`);
        await fileSyncManager.syncCurrentFile(document.fileName);
      }
    })
  );

  // Handle workspace changes to stop syncing when switching workspaces
  vscode.workspace.onDidChangeWorkspaceFolders(() => {
    fileSyncManager.stopWatching();
  });

  context.subscriptions.push({
    dispose: () => {
      fileSyncManager.dispose();
    }
  });

  // Check authentication on startup
  // First try to restore existing session silently
  const restored = await firebaseService.restoreSession();

  if (!restored) {
    const user = firebaseService.getCurrentUser();
    if (!user) {
      vscode.window.showInformationMessage(
        'CS Learning Platform: Sign in to access your courses',
        'Sign In'
      ).then(selection => {
        if (selection === 'Sign In') {
          vscode.commands.executeCommand('csLearningPlatform.login');
        }
      });
    } else {
      // Refresh course tree if user is signed in (SDK persistence worked)
      courseTreeProvider.refresh();
    }
  } else {
    // Session restored successfully
    courseTreeProvider.refresh();
  }
}

function registerCommands(
  context: vscode.ExtensionContext,
  firebase: FirebaseService,
  workspace: WorkspaceManager,
  courseTree: CourseTreeProvider,
  lessonProvider: LessonWebviewProvider,
  chatParticipant: OakleyChatParticipant,
  fileSyncManager: FileSyncManager
) {
  // Authentication commands
  context.subscriptions.push(
    vscode.commands.registerCommand('csLearningPlatform.login', async () => {
      try {
        await firebase.signIn();
        // Refresh course tree after login
        courseTree.refresh();
      } catch (error) {
        console.error('Login failed:', error);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('csLearningPlatform.logout', async () => {
      await firebase.signOut();
      // Refresh course tree after logout
      courseTree.refresh();
    })
  );

  // Google sign-in command
  context.subscriptions.push(
    vscode.commands.registerCommand('csLearningPlatform.loginWithGoogle', async () => {
      try {
        await firebase.signInWithGoogle();
        // Refresh course tree after login
        courseTree.refresh();
      } catch (error) {
        console.error('Google login failed:', error);
      }
    })
  );

  // Test command to verify Firebase connection
  context.subscriptions.push(
    vscode.commands.registerCommand('csLearningPlatform.testConnection', async () => {
      const user = firebase.getCurrentUser();
      if (!user) {
        vscode.window.showWarningMessage('Not signed in. Please sign in first.');
        return;
      }

      try {
        vscode.window.showInformationMessage('Testing Firebase connection...');

        // Try to fetch courses
        // For now, we'll just confirm the user is authenticated
        vscode.window.showInformationMessage(
          `Connected! User: ${user.email}`
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Connection test failed: ${error.message}`
        );
      }
    })
  );

  // Course and lesson navigation commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'csLearningPlatform.openCourse',
      async (courseId: string) => {
        try {
          await workspace.openCourse(courseId);
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to open course: ${error.message}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'csLearningPlatform.openLesson',
      async (courseId: string, topicId: string, lessonId: string) => {
        try {
          await workspace.openLesson(courseId, topicId, lessonId);

          // Fetch lesson content to update the webview
          console.log(`Extension: fetching data for lesson ${lessonId}`);
          const lesson = await firebase.getLesson(lessonId);
          const sections = await firebase.getSections(lessonId);
          const topic = await firebase.getTopic(topicId);
          console.log(`Extension: fetched lesson: ${!!lesson}, sections: ${sections?.length}`);

          if (lesson) {
            lessonProvider.updateLessonContent(
              courseId,
              topicId,
              lessonId,
              lesson.lessonName,
              sections
            );

            // Start file sync for this lesson
            if (sections) {
              const lessonFolderName = lesson.lessonSlug || lessonId;
              const topicFolderName = topic?.topicSlug || topicId;

              const userId = firebase.getUserId();
              const course = await firebase.getCourse(courseId);
              const courseFolderName = course?.courseSlug || courseId;

              // We need the full path to the exercises folder for the sync manager
              const workspaceRoot = workspace.getWorkspaceRoot();
              const exercisesPath = path.join(
                workspaceRoot,
                userId!,
                courseFolderName,
                'topics',
                topicFolderName,
                lessonFolderName,
                'exercises'
              );

              fileSyncManager.trackLesson(
                exercisesPath,
                lessonId,
                sections,
                courseId
              );
            }
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to open lesson: ${error.message}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'csLearningPlatform.openExercise',
      async (courseId: string, topicId: string, lessonId: string, section: any) => {
        try {
          // Ensure lesson workspace is set up
          await workspace.openLesson(courseId, topicId, lessonId);

          // Sync and open the specific exercise file (fetches latest student answer)
          const exercisePath = await workspace.syncExerciseFile(section);
          if (exercisePath) {
            const document = await vscode.workspace.openTextDocument(exercisePath);
            await vscode.window.showTextDocument(document);
          }
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to open exercise: ${error.message}`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'csLearningPlatform.checkAnswer',
      async (item: any) => {
        // If the item has the properties we need (we made them public in CourseTreeProvider)
        if (!item || !item.section) {
          vscode.window.showErrorMessage("Could not identify exercise context.");
          return;
        }

        const section = item.section;
        const courseId = item.courseId;
        const lessonId = item.lessonId;

        // Get the file path
        const filePath = await workspace.getExerciseFilePath(section);
        if (!filePath) {
          vscode.window.showErrorMessage("Exercise file path not found. Please open the lesson first.");
          return;
        }

        try {
          // Read student code
          const studentCode = await fs.readFile(filePath, 'utf-8');

          // Set context for chat
          chatParticipant.setGradingContext({
            courseId,
            lessonId,
            sectionId: section.id,
            question: section.content || section.title,
            studentAnswer: studentCode,
            maxPoints: section.points || 10,
            language: section.language || 'text'
          });

          // Open Chat
          await vscode.commands.executeCommand('workbench.action.chat.open', '@oakley grade');

        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to check answer: ${error.message}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('csLearningPlatform.refreshCourses', () => {
      courseTree.refresh();
      vscode.window.showInformationMessage('Courses refreshed');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'csLearningPlatform.getHint',
      async (item: any) => {
        // If the item has the properties we need
        if (!item || !item.section) {
          vscode.window.showErrorMessage("Could not identify exercise context.");
          return;
        }

        const section = item.section;

        // Get the file path
        const filePath = await workspace.getExerciseFilePath(section);
        if (!filePath) {
          vscode.window.showErrorMessage("Exercise file path not found. Please open the lesson first.");
          return;
        }

        try {
          // Read student code
          const studentCode = await fs.readFile(filePath, 'utf-8');

          // Set context for chat
          chatParticipant.setHintContext({
            question: section.content || section.title,
            studentAnswer: studentCode,
            language: section.language || 'text'
          });

          // Open Chat with hint command
          await vscode.commands.executeCommand('workbench.action.chat.open', '@oakley hint');

        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to get hint: ${error.message}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'csLearningPlatform.submitExercise',
      async () => {
        vscode.window.showInformationMessage(
          'Submit exercise (Phase 3 implementation)'
        );
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('csLearningPlatform.syncNow', () => {
      vscode.window.showInformationMessage(
        'Sync now (Phase 3 implementation)'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('csLearningPlatform.pauseSync', () => {
      vscode.window.showInformationMessage(
        'Pause sync (Phase 3 implementation)'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('csLearningPlatform.resumeSync', () => {
      vscode.window.showInformationMessage(
        'Resume sync (Phase 3 implementation)'
      );
    })
  );
}

export function deactivate() {
  console.log('CS Learning Platform extension is now deactivated');
}
