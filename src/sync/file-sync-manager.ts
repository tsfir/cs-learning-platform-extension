import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { FirebaseService } from '../services/firebase-service';
import { WorkspaceManager } from '../managers/workspace-manager';
import type { Section } from '../models';

export class FileSyncManager {
  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private pendingSaves = new Map<string, NodeJS.Timeout>();
  private syncInProgress = new Set<string>();

  constructor(
    private firebase: FirebaseService,
    private workspaceManager: WorkspaceManager
  ) { }

  /**
   * Start monitoring exercise files for changes
   */
  startWatching(exercisesPath: string, lessonId: string, sections: Section[], courseId: string): void {
    // Create a map of file paths to section IDs for quick lookup
    const fileToSectionMap = new Map<string, Section>();

    for (const section of sections) {
      if (section.type === 'code') {
        const language = section.language || 'python';
        const ext = this.getFileExtension(language);
        const fileName = `exercise_${section.orderIndex}_${this.sanitizeFileName(section.title)}.${ext}`;
        const filePath = path.join(exercisesPath, fileName);
        fileToSectionMap.set(filePath.toLowerCase(), section);
        console.log(`[FileSyncManager] Tracking file: ${filePath}`);
      }
    }

    // Stop previous watcher if exists
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }

    console.log(`[FileSyncManager] Starting watcher for: ${exercisesPath}`);

    // Watch the exercises directory with glob pattern for code files
    const pattern = path.join(exercisesPath, '**', '*.{py,java,cs,ts,js}');
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    // On file change, queue a sync
    this.fileWatcher.onDidChange((uri) => {
      console.log(`[FileSyncManager] File changed: ${uri.fsPath}`);
      this.queueSync(uri.fsPath, fileToSectionMap, lessonId, courseId);
    });

    vscode.window.showInformationMessage('File sync enabled for this lesson');
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
  }

  /**
   * Queue a sync with debouncing to avoid multiple syncs while user is typing
   */
  private queueSync(
    filePath: string,
    fileToSectionMap: Map<string, Section>,
    lessonId: string,
    courseId: string,
    delayMs: number = 2000
  ): void {
    // Cancel previous timeout for this file
    const existingTimeout = this.pendingSaves.get(filePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      console.log(`[FileSyncManager] Cancelled previous sync timer for: ${path.basename(filePath)}`);
    }

    // Set new timeout
    const timeout = setTimeout(async () => {
      console.log(`[FileSyncManager] Executing sync for: ${path.basename(filePath)}`);
      await this.syncFile(filePath, fileToSectionMap, lessonId, courseId);
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
    fileToSectionMap: Map<string, Section>,
    lessonId: string,
    courseId: string
  ): Promise<void> {
    const filePathLower = filePath.toLowerCase();
    const section = fileToSectionMap.get(filePathLower);

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

      // Save to Firebase
      await this.firebase.saveStudentAnswer(
        section.id,
        userId,
        lessonId,
        content,
        'code',
        courseId
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
   * Store the fileToSectionMap for manual sync operations
   */
  private fileToSectionMap: Map<string, Section> | null = null;
  private currentLessonId: string | null = null;
  private currentCourseId: string | null = null;

  /**
   * Enhanced startWatching that stores necessary state for manual syncs
   */
  startWatchingWithState(
    exercisesPath: string,
    lessonId: string,
    sections: Section[],
    courseId: string
  ): void {
    // Store state for manual sync
    this.currentLessonId = lessonId;
    this.currentCourseId = courseId;
    this.fileToSectionMap = new Map();

    for (const section of sections) {
      if (section.type === 'code') {
        const language = section.language || 'python';
        const ext = this.getFileExtension(language);
        const fileName = `exercise_${section.orderIndex}_${this.sanitizeFileName(section.title)}.${ext}`;
        const filePath = path.join(exercisesPath, fileName);
        this.fileToSectionMap!.set(filePath.toLowerCase(), section);
      }
    }

    this.startWatching(exercisesPath, lessonId, sections, courseId);
  }

  /**
   * Manual sync - for testing or triggering sync from UI
   */
  async syncCurrentFile(filePath: string): Promise<void> {
    if (!this.fileToSectionMap || !this.currentLessonId || !this.currentCourseId) {
      console.warn('[FileSyncManager] No active watcher state');
      return;
    }
    await this.syncFile(filePath, this.fileToSectionMap, this.currentLessonId, this.currentCourseId);
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
  }
}
