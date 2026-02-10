import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { FirebaseService } from '../services/firebase-service';
import { WorkspaceManager } from '../managers/workspace-manager';
import { InputMetricsTracker } from './input-metrics-tracker';
import type { Section } from '../models';

export class FileSyncManager {
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private pendingSaves = new Map<string, NodeJS.Timeout>();
  private syncInProgress = new Set<string>();
  private fileToSectionMap = new Map<string, Section>();
  private trackedLessons = new Set<string>();
  private currentCourseId: string | null = null;
  private metricsTracker: InputMetricsTracker;

  constructor(
    private firebase: FirebaseService,
    private workspaceManager: WorkspaceManager
  ) {
    this.metricsTracker = new InputMetricsTracker();
  }

  /**
   * Add a lesson to the watcher and start tracking its files
   */
  trackLesson(exercisesPath: string, lessonId: string, sections: Section[], courseId: string): void {
    if (this.currentCourseId && this.currentCourseId !== courseId) {
      console.log(`[FileSyncManager] Course changed, stopping current activity`);
      this.stopWatching();
    }

    this.currentCourseId = courseId;
    this.trackedLessons.add(lessonId);

    // Append sections to the global map
    for (const section of sections) {
      if (section.type === 'code') {
        const language = section.language || 'python';
        const ext = this.getFileExtension(language);
        const fileName = `exercise_${section.orderIndex}_${this.sanitizeFileName(section.title)}.${ext}`;
        const filePath = path.join(exercisesPath, fileName);
        this.fileToSectionMap.set(filePath.toLowerCase(), section);
        console.log(`[FileSyncManager] Now tracking: ${fileName} (Lesson: ${lessonId})`);
      }
    }

    // Ensure watcher is active for the course root
    if (!this.fileWatcher) {
      this.startCourseWatcher(courseId);
    }
  }

  private startCourseWatcher(courseId: string): void {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    console.log(`[FileSyncManager] Starting course-level watcher for: ${workspaceRoot}`);

    // Watch all code files in the workspace
    const pattern = new vscode.RelativePattern(workspaceRoot, 'topics/**/*.{py,java,cs,ts,js}');
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.fileWatcher.onDidChange((uri) => {
      this.queueSync(uri.fsPath, '', courseId);
    });

    vscode.window.showInformationMessage(`Continuous syncing enabled for ${this.trackedLessons.size} lesson(s)`);
  }

  /**
   * Stop watching files
   */
  stopWatching(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }
    this.pendingSaves.clear();
    this.fileToSectionMap.clear();
    this.trackedLessons.clear();
    this.currentCourseId = null;
  }

  /**
   * Queue a sync with debouncing to avoid multiple syncs while user is typing
   */
  private queueSync(
    filePath: string,
    unused_lessonId: string,
    courseId: string,
    delayMs: number = 2000
  ): void {
    const existingTimeout = this.pendingSaves.get(filePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      console.log(`[FileSyncManager] Cancelled previous sync timer for: ${path.basename(filePath)}`);
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      console.log(`[FileSyncManager] Executing sync for: ${path.basename(filePath)}`);
      await this.syncFile(filePath, courseId);
      this.pendingSaves.delete(filePath);
    }, delayMs);

    this.pendingSaves.set(filePath, timeout);
    console.log(`[FileSyncManager] Queued sync (${delayMs}ms) for: ${path.basename(filePath)}`);
  }

  /**
   * Sync a single file to Firebase
   */
  private async syncFile(
    filePath: string,
    courseId: string
  ): Promise<void> {
    const filePathLower = filePath.toLowerCase();
    const section = this.fileToSectionMap.get(filePathLower);

    if (!section) {
      console.log(`[FileSyncManager] File not tracked in section map: ${filePath}`);
      return; // File not tracked
    }

    // Prevent concurrent syncs of the same file
    if (this.syncInProgress.has(filePath)) {
      console.log(`[FileSyncManager] Sync already in progress for: ${filePath}`);
      return;
    }

    try {
      this.syncInProgress.add(filePath);
      const userId = this.firebase.getUserId();

      if (!userId) {
        console.warn(`[FileSyncManager] No userId found, cannot sync`);
        vscode.window.showWarningMessage('Not signed in. Changes will not be synced.');
        return;
      }

      console.log(`[FileSyncManager] Reading file: ${filePath}`);
      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      console.log(`[FileSyncManager] File read, ${content.length} bytes. Saving to Firebase...`);

      // Collect input metrics and reset for next cycle
      const inputMetrics = this.metricsTracker.getAndReset(filePath, content.length);
      console.log(`[FileSyncManager] Metrics: ${inputMetrics.keystrokeCount} keystrokes, ${inputMetrics.pasteCount} pastes, ${inputMetrics.editDurationMs}ms`);

      // Save to Firebase with metrics
      await this.firebase.saveStudentAnswer(
        section.id,
        userId,
        section.lessonId,
        content,
        'code',
        courseId,
        inputMetrics
      );

      console.log(`[FileSyncManager] Successfully synced: ${filePath}`);
      vscode.window.showInformationMessage(`Synced: ${path.basename(filePath)}`);
    } catch (error: any) {
      console.error(`[FileSyncManager] Sync error:`, error);
      vscode.window.showErrorMessage(`Failed to sync file: ${error.message}`);
    } finally {
      this.syncInProgress.delete(filePath);
    }
  }

  /**
   * Manual sync - for testing or triggering sync from UI
   */
  async syncCurrentFile(filePath: string): Promise<void> {
    if (this.fileToSectionMap.size === 0 || !this.currentCourseId) {
      console.warn('[FileSyncManager] No active watcher state');
      return;
    }
    await this.syncFile(filePath, this.currentCourseId);
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

  dispose(): void {
    this.stopWatching();
    this.metricsTracker.dispose();
  }
}
