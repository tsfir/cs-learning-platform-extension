import * as vscode from 'vscode';
import { FirebaseService } from '../services/firebase-service';
import { WorkspaceManager } from '../managers/workspace-manager';
import type { Course, Topic, Lesson, Section } from '../models';

type TreeItem = CourseTreeItem | TopicTreeItem | LessonTreeItem | ExerciseTreeItem;

class CourseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly course: Course,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(course.courseName, collapsibleState);
    this.tooltip = course.description;
    this.description = course.level;
    this.iconPath = new vscode.ThemeIcon('book');
    this.contextValue = 'course';

    // Add command to open course
    this.command = {
      command: 'csLearningPlatform.openCourse',
      title: 'Open Course',
      arguments: [course.id],
    };
  }
}

class TopicTreeItem extends vscode.TreeItem {
  constructor(
    public readonly topic: Topic,
    public readonly courseId: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(topic.topicName, collapsibleState);
    this.tooltip = `${topic.topicName} - ${topic.level}`;
    this.description = topic.level;
    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'topic';
  }
}

class LessonTreeItem extends vscode.TreeItem {
  constructor(
    public readonly lesson: Lesson,
    public readonly courseId: string,
    public readonly topicId: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ,
    public readonly completed: boolean = false
  ) {
    super(lesson.lessonName, collapsibleState);
    this.tooltip = `${lesson.lessonType} lesson`;
    this.description = completed ? `${lesson.lessonType} • Completed` : lesson.lessonType;

    // Different icons for different lesson types; show completed marker when applicable
    if (completed) {
      this.iconPath = new vscode.ThemeIcon('check');
    } else if (lesson.lessonType === 'exercise') {
      this.iconPath = new vscode.ThemeIcon('debug-alt');
    } else if (lesson.lessonType === 'quiz') {
      this.iconPath = new vscode.ThemeIcon('checklist');
    } else {
      this.iconPath = new vscode.ThemeIcon('file-text');
    }

    this.contextValue = 'lesson';
    // Add command so selecting a lesson opens it in the webview
    this.command = {
      command: 'csLearningPlatform.openLesson',
      title: 'Open Lesson',
      arguments: [this.courseId, this.topicId, this.lesson.id],
    };
  }
}

class ExerciseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly section: Section,
    public readonly courseId: string,
    public readonly topicId: string,
    public readonly lessonId: string,
    public readonly sectionNumber: number
    ,
    public readonly grade?: number
  ) {
    super(`${sectionNumber}. ${section.title || 'Exercise'}`, vscode.TreeItemCollapsibleState.None);
    this.tooltip = section.title || 'Code Exercise';
    this.description = grade !== undefined ? `Grade: ${grade}` : (section.language || 'code');
    this.iconPath = new vscode.ThemeIcon('code');
    this.contextValue = 'exercise';

    // Add command to open exercise
    this.command = {
      command: 'csLearningPlatform.openExercise',
      title: 'Open Exercise',
      arguments: [courseId, topicId, lessonId, section],
    };
  }
}

export class CourseTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> =
    new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(
    private firebase: FirebaseService,
    private workspace: WorkspaceManager
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    // Check if user is signed in
    const user = this.firebase.getCurrentUser();
    if (!user) {
      vscode.window.showInformationMessage('Sign in to view courses');
      return [];
    }

    if (!element) {
      // Root level - show all active courses
      return this.getCourses();
    } else if (element instanceof CourseTreeItem) {
      // Show topics for this course
      return this.getTopics(element.course.id);
    } else if (element instanceof TopicTreeItem) {
      // Show lessons for this topic
      return this.getLessons(element.topic.id);
    } else if (element instanceof LessonTreeItem) {
      // Show exercises for this lesson
      return this.getExercises(element.lesson.id, element.courseId, element.topicId);
    }

    return [];
  }

  private async getCourses(): Promise<CourseTreeItem[]> {
    try {
      const courses = await this.workspace.getActiveCourses();

      return courses.map(
        (course) =>
          new CourseTreeItem(
            course,
            vscode.TreeItemCollapsibleState.Collapsed
          )
      );
    } catch (error) {
      console.error('Error loading courses:', error);
      vscode.window.showErrorMessage('Failed to load courses');
      return [];
    }
  }

  private async getTopics(courseId: string): Promise<TopicTreeItem[]> {
    try {
      const topics = await this.firebase.getTopics(courseId);

      return topics.map(
        (topic) =>
          new TopicTreeItem(
            topic,
            courseId,
            vscode.TreeItemCollapsibleState.Collapsed
          )
      );
    } catch (error) {
      console.error('Error loading topics:', error);
      vscode.window.showErrorMessage('Failed to load topics');
      return [];
    }
  }

  private async getLessons(topicId: string): Promise<LessonTreeItem[]> {
    try {
      const lessons = await this.firebase.getLessons(topicId);
      const userId = this.firebase.getUserId();

      // Check if user is the course owner (for filtering unpublished lessons)
      let isCourseOwner = false;
      if (lessons.length > 0 && userId) {
        const course = await this.firebase.getCourse(lessons[0].courseId);
        isCourseOwner = course?.createdBy === userId;
      }

      const items: LessonTreeItem[] = [];
      for (const lesson of lessons) {
        // Filter out unpublished lessons for non-owners
        if (lesson.isPublished === false && !isCourseOwner) {
          continue;
        }

        // Determine completion: all code sections must have a non-zero grade
        let completed = false;
        const sections = await this.firebase.getSections(lesson.id);
        const codeSections = sections.filter((s) => s.type === 'code');

        if (codeSections.length > 0 && userId) {
          let allDone = true;
          for (const s of codeSections) {
            const ans = await this.firebase.getStudentAnswer(s.id, userId);
            if (!ans || !ans.grade || ans.grade === 0) {
              allDone = false;
              break;
            }
          }
          completed = allDone;
        }

        items.push(
          new LessonTreeItem(
            lesson,
            lesson.courseId,
            topicId,
            vscode.TreeItemCollapsibleState.Collapsed,
            completed
          )
        );
      }

      return items;
    } catch (error) {
      console.error('Error loading lessons:', error);
      vscode.window.showErrorMessage('Failed to load lessons');
      return [];
    }
  }

  private async getExercises(lessonId: string, courseId: string, topicId: string): Promise<ExerciseTreeItem[]> {
    try {
      const sections = await this.firebase.getSections(lessonId);
      // Filter for code sections only
      const codeSections = sections.filter((s) => s.type === 'code');
      const userId = this.firebase.getUserId();
      const items: ExerciseTreeItem[] = [];

      for (let index = 0; index < codeSections.length; index++) {
        const section = codeSections[index];
        let grade: number | undefined = undefined;
        if (userId) {
          const ans = await this.firebase.getStudentAnswer(section.id, userId);
          if (ans && typeof (ans as any).grade === 'number') {
            grade = (ans as any).grade;
          }
        }

        items.push(
          new ExerciseTreeItem(
            section,
            courseId,
            topicId,
            lessonId,
            index + 1,
            grade
          )
        );
      }

      return items;
    } catch (error) {
      console.error('Error loading exercises:', error);
      vscode.window.showErrorMessage('Failed to load exercises');
      return [];
    }
  }
}
