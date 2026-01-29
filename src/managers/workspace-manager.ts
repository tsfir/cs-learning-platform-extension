import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { simpleGit, type SimpleGit } from 'simple-git';
import { FirebaseService } from '../services/firebase-service';
import type { Course, Topic, Lesson, Section } from '../models';

interface WorkspaceStructure {
  userId: string;
  courseId: string;
  topicId: string;
  lessonId: string;
  courseSlug?: string;
  topicSlug?: string;
  lessonSlug?: string;
  basePath: string;
  coursePath: string;
  topicPath: string;
  lessonPath: string;
  exercisesPath: string;
}

export class WorkspaceManager {
  private git: SimpleGit;
  private currentWorkspace: WorkspaceStructure | null = null;

  constructor(
    private context: vscode.ExtensionContext,
    private firebase: FirebaseService
  ) {
    this.git = simpleGit();
  }

  /**
   * Opens a course by creating/navigating to its workspace
   */
  async openCourse(courseId: string): Promise<void> {
    const userId = this.firebase.getUserId();
    if (!userId) {
      vscode.window.showErrorMessage('Please sign in first');
      return;
    }

    const course = await this.firebase.getCourse(courseId);
    if (!course) {
      vscode.window.showErrorMessage('Course not found');
      return;
    }

    const workspaceRoot = this.getWorkspaceRoot();
    // Use courseSlug for folder name, fallback to courseId
    const courseFolderName = course.courseSlug || courseId;
    const coursePath = path.join(workspaceRoot, userId, courseFolderName);

    // Create course directory if it doesn't exist
    await this.ensureDirectory(coursePath);

    // Check if project exists
    const projectExists = await this.checkProjectExists(coursePath);

    if (!projectExists && course.gitTemplateRepository) {
      // Clone from git template
      await this.initializeProjectFromTemplate(coursePath, course);
    } else if (!projectExists) {
      // Create empty project structure
      await this.createEmptyProject(coursePath, course);
    }

    // Open course folder in VS Code
    const uri = vscode.Uri.file(coursePath);

    // Check if we're already in this workspace
    const currentWorkspace = vscode.workspace.workspaceFolders?.[0];
    if (currentWorkspace?.uri.fsPath === coursePath) {
      vscode.window.showInformationMessage(`Already in ${course.courseName} workspace`);
    } else {
      await vscode.commands.executeCommand('vscode.openFolder', uri, {
        forceNewWindow: false,
      });
    }
  }

  /**
   * Opens a specific lesson
   */
  async openLesson(
    courseId: string,
    topicId: string,
    lessonId: string
  ): Promise<void> {
    const userId = this.firebase.getUserId();
    if (!userId) {
      vscode.window.showErrorMessage('Please sign in first');
      return;
    }

    // If we've already set up this lesson workspace, no need to re-run setup or show notifications.
    if (
      this.currentWorkspace &&
      this.currentWorkspace.courseId === courseId &&
      this.currentWorkspace.topicId === topicId &&
      this.currentWorkspace.lessonId === lessonId
    ) {
      // Already prepared for this lesson; silently return so actions like opening different
      // exercises in the same lesson don't trigger workspace change notifications.
      return;
    }

    vscode.window.showInformationMessage('Opening lesson workspace...');

    // Fetch course, topic, and lesson to get slugs
    const course = await this.firebase.getCourse(courseId);
    const topic = await this.firebase.getTopic(topicId);
    const lesson = await this.firebase.getLesson(lessonId);

    // Use slugs for folder names, fallback to IDs
    const courseFolderName = course?.courseSlug || courseId;
    const topicFolderName = topic?.topicSlug || topicId;
    const lessonFolderName = lesson?.lessonSlug || lessonId;

    const workspaceRoot = this.getWorkspaceRoot();
    const coursePath = path.join(workspaceRoot, userId, courseFolderName);
    const topicPath = path.join(coursePath, 'topics', topicFolderName);
    const lessonPath = path.join(topicPath, lessonFolderName);
    const exercisesPath = path.join(lessonPath, 'exercises');

    // Create directory structure
    await this.ensureDirectory(coursePath);
    await this.ensureDirectory(topicPath);
    await this.ensureDirectory(lessonPath);
    await this.ensureDirectory(exercisesPath);

    // Initialize course project if needed
    if (course) {
      const projectExists = await this.checkProjectExists(coursePath);
      if (!projectExists && course.gitTemplateRepository) {
        await this.initializeProjectFromTemplate(coursePath, course);
      } else if (!projectExists) {
        await this.createEmptyProject(coursePath, course);
      }
    }

    this.currentWorkspace = {
      userId,
      courseId,
      topicId,
      lessonId,
      courseSlug: course?.courseSlug,
      topicSlug: topic?.topicSlug,
      lessonSlug: lesson?.lessonSlug,
      basePath: workspaceRoot,
      coursePath,
      topicPath,
      lessonPath,
      exercisesPath,
    };

    // Load lesson content and create exercise files
    await this.setupLessonFiles(lessonId, lessonPath, exercisesPath);

    // Open course folder in VS Code if not already open
    const uri = vscode.Uri.file(coursePath);
    const currentWorkspace = vscode.workspace.workspaceFolders?.[0];

    if (!currentWorkspace) {
      // No workspace open, open the course folder
      await vscode.commands.executeCommand('vscode.openFolder', uri, {
        forceNewWindow: false,
      });

      // Open first exercise file after workspace loads
      setTimeout(async () => {
        await this.openFirstExercise(exercisesPath);
      }, 1000);
    } else if (currentWorkspace.uri.fsPath !== coursePath) {
      // Different workspace open, ask user what to do
      const choice = await vscode.window.showWarningMessage(
        `This lesson is in a different course. Would you like to switch to that course folder?`,
        'Switch Workspace',
        'Stay Here'
      );

      if (choice === 'Switch Workspace') {
        await vscode.commands.executeCommand('vscode.openFolder', uri, {
          forceNewWindow: false,
        });

        // Open first exercise file after workspace loads
        setTimeout(async () => {
          await this.openFirstExercise(exercisesPath);
        }, 1000);
      } else {
        // Stay in current workspace but still open the exercise file
        await this.openFirstExercise(exercisesPath);
      }
    } else {
      // Already in correct workspace, just open the exercise
      await this.openFirstExercise(exercisesPath);
    }

    // Update workspace state
    this.context.workspaceState.update('currentLesson', {
      courseId,
      topicId,
      lessonId,
    });

    vscode.window.showInformationMessage('Lesson workspace ready!');
  }

  private getWorkspaceRoot(): string {
    const config = vscode.workspace.getConfiguration('csLearningPlatform');
    const configuredRoot = config.get<string>('workspaceRoot');

    if (configuredRoot) {
      // Expand ~ to home directory
      return configuredRoot.replace(/^~/, require('os').homedir());
    }

    // Default to user's home directory
    return path.join(require('os').homedir(), 'cs-platform-workspace');
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  private async checkProjectExists(projectPath: string): Promise<boolean> {
    try {
      const files = await fs.readdir(projectPath);
      // Check if there are any files besides the topics folder
      const relevantFiles = files.filter(f => f !== 'topics');
      return relevantFiles.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Initialize project from git template stored in course data
   */
  private async initializeProjectFromTemplate(
    projectPath: string,
    course: Course
  ): Promise<void> {
    const gitTemplateUrl = course.gitTemplateRepository;

    if (!gitTemplateUrl) {
      vscode.window.showWarningMessage(
        'No template found for this course. Creating empty project.'
      );
      await this.createEmptyProject(projectPath, course);
      return;
    }

    vscode.window.showInformationMessage(
      `Initializing ${course.courseName} project from template...`
    );

    try {
      // Clone the template repository
      await this.git.clone(gitTemplateUrl, projectPath, ['--depth', '1']);

      // Remove .git folder to detach from template repo
      const gitFolder = path.join(projectPath, '.git');
      try {
        await fs.rm(gitFolder, { recursive: true, force: true });
      } catch (error) {
        console.error('Failed to remove .git folder:', error);
      }

      // Initialize new git repo
      await this.git.cwd(projectPath);
      await this.git.init();
      await this.git.add('.');
      await this.git.commit('Initial commit from template');

      vscode.window.showInformationMessage(
        `${course.courseName} project initialized successfully!`
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to initialize project from template: ${error.message}`
      );
      console.error('Git clone error:', error);

      // Fallback to empty project
      await this.createEmptyProject(projectPath, course);
    }
  }

  private async createEmptyProject(
    projectPath: string,
    course: Course
  ): Promise<void> {
    // Create basic project structure
    await this.ensureDirectory(path.join(projectPath, 'topics'));
    await this.ensureDirectory(path.join(projectPath, 'resources'));

    // Create README
    const readmeContent = `# ${course.courseName}

${course.description}

**Level:** ${course.level}
**Category:** ${course.category}
**Duration:** ${course.durationHours} hours

## Course Structure

This workspace was created by the CS Learning Platform extension.

### Topics

Your lessons will be organized in the \`topics/\` folder:
- Each topic has its own folder
- Each lesson within a topic has its own folder
- Exercise files are in \`exercises/\` subfolder

### Getting Started

1. Navigate to a lesson using the CS Platform commands
2. Complete the exercises in the \`exercises/\` folder
3. Submit your code when ready

---

Created: ${new Date().toLocaleDateString()}
`;

    await fs.writeFile(
      path.join(projectPath, 'README.md'),
      readmeContent,
      'utf-8'
    );

    // Create .gitignore
    const gitignoreContent = `# CS Learning Platform
node_modules/
*.class
*.pyc
__pycache__/
bin/
obj/
.vs/
.vscode/settings.json
*.log
`;

    await fs.writeFile(
      path.join(projectPath, '.gitignore'),
      gitignoreContent,
      'utf-8'
    );

    // Initialize git
    try {
      await this.git.cwd(projectPath);
      await this.git.init();
      await this.git.add('.');
      await this.git.commit('Initial commit');
    } catch (error) {
      console.error('Git initialization error:', error);
    }
  }

  /**
   * Setup files for a lesson (all sections, not just code)
   */
  private async setupLessonFiles(
    lessonId: string,
    lessonPath: string,
    exercisesPath: string
  ): Promise<void> {
    // Get current user ID for fetching student answers
    const userId = this.firebase.getUserId();

    // Get all lesson sections
    const sections = await this.firebase.getSections(lessonId);

    // Create a README for the lesson with all content
    await this.createLessonReadme(lessonId, lessonPath, sections);

    // Create exercise files for code sections
    const codeSections = sections.filter((s: Section) => s.type === 'code');

    for (const section of codeSections) {
      await this.createExerciseFile(section, exercisesPath, userId);
    }

    vscode.window.showInformationMessage(
      `Created ${codeSections.length} exercise file(s)`
    );
  }

  private async createLessonReadme(
    lessonId: string,
    lessonPath: string,
    sections: Section[]
  ): Promise<void> {
    let readmeContent = `# Lesson Content\n\n`;

    for (const section of sections) {
      readmeContent += `## ${section.title}\n\n`;

      if (section.type === 'text') {
        readmeContent += `${section.content}\n\n`;
      } else if (section.type === 'code') {
        readmeContent += `**Exercise:** See \`exercises/exercise_${section.orderIndex}_${this.sanitizeFileName(section.title)}.${this.getFileExtension(section.language || 'python')}\`\n\n`;
        if (section.content) {
          readmeContent += `${section.content}\n\n`;
        }
      } else if (section.type === 'video') {
        readmeContent += `**Video:** ${section.content}\n\n`;
      } else if (section.type === 'interactive') {
        readmeContent += `**Interactive Content**\n\n${section.content}\n\n`;
      }

      readmeContent += `---\n\n`;
    }

    await fs.writeFile(
      path.join(lessonPath, 'README.md'),
      readmeContent,
      'utf-8'
    );
  }

  private async createExerciseFile(
    section: Section,
    exercisesPath: string,
    userId?: string
  ): Promise<void> {
    const language = section.language || 'python';
    const extension = this.getFileExtension(language);
    const fileName = `exercise_${section.orderIndex}_${this.sanitizeFileName(section.title)}.${extension}`;
    const filePath = path.join(exercisesPath, fileName);

    // Check if file already exists
    const fileExists = await this.fileExists(filePath);

    // Try to fetch student's existing answer from the web app
    let studentAnswer: string | null = null;
    if (userId) {
      const answer = await this.firebase.getStudentAnswer(section.id, userId);
      if (answer && answer.answer) {
        studentAnswer = answer.answer;
      }
    }

    // Determine file content priority:
    // 1. Student's existing answer (sync from web app)
    // 2. Starter value / boilerplate from section
    // 3. Default template
    if (studentAnswer) {
      // Always sync student's answer from web app (overwrite local if exists)
      await fs.writeFile(filePath, studentAnswer, 'utf-8');
      console.log(`Synced student answer to exercise file: ${fileName}`);
    } else if (!fileExists) {
      // No student answer and file doesn't exist - use starter value or default
      const starterCode = section.starterValue || '';
      const content = starterCode || this.getDefaultBoilerplate(language, section.title);
      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`Created exercise file with starter code: ${fileName}`);
    } else {
      // File exists but no student answer - preserve local work
      console.log(`Exercise file already exists, preserving local work: ${fileName}`);
    }
  }

  private getDefaultBoilerplate(language: string, title: string): string {
    const comment = this.getCommentSyntax(language);
    return `${comment} Exercise: ${title}\n${comment} TODO: Implement your solution here\n\n`;
  }

  private getCommentSyntax(language: string): string {
    const syntax: Record<string, string> = {
      python: '#',
      java: '//',
      csharp: '//',
      typescript: '//',
      javascript: '//',
    };
    return syntax[language.toLowerCase()] || '#';
  }

  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private getFileExtension(language: string): string {
    const extensions: Record<string, string> = {
      python: 'py',
      java: 'java',
      csharp: 'cs',
      typescript: 'ts',
      javascript: 'js',
    };
    return extensions[language.toLowerCase()] || 'txt';
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async openFirstExercise(exercisesPath: string): Promise<void> {
    try {
      const files = await fs.readdir(exercisesPath);
      const exerciseFiles = files.filter(f => f.startsWith('exercise_')).sort();

      if (exerciseFiles.length > 0) {
        const firstFile = exerciseFiles[0];
        const filePath = path.join(exercisesPath, firstFile);
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
      }
    } catch (error) {
      console.error('Failed to open first exercise:', error);
    }
  }

  /**
   * Get current workspace structure
   */
  getCurrentWorkspace(): WorkspaceStructure | null {
    return this.currentWorkspace;
  }

  /**
   * Get exercise file path by section
   */
  getExerciseFilePath(section: Section): string | null {
    if (!this.currentWorkspace) {
      return null;
    }

    const extension = this.getFileExtension(section.language || 'python');
    const fileName = `exercise_${section.orderIndex}_${this.sanitizeFileName(section.title)}.${extension}`;
    return path.join(this.currentWorkspace.exercisesPath, fileName);
  }

  /**
   * Sync a specific exercise file with student's answer from web app
   */
  async syncExerciseFile(section: Section): Promise<string | null> {
    if (!this.currentWorkspace) {
      return null;
    }

    const userId = this.firebase.getUserId();
    await this.createExerciseFile(section, this.currentWorkspace.exercisesPath, userId);
    return this.getExerciseFilePath(section);
  }

  /**
   * Get all active courses
   */
  async getActiveCourses(): Promise<Course[]> {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    const db = (this.firebase as any).db;

    const q = query(
      collection(db, 'courses'),
      where('isActive', '==', true)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Course));
  }
}
