import * as vscode from 'vscode';
import type { InputMetrics } from '../models';

/**
 * Tracks per-file input metrics (keystrokes, pastes, timing) for integrity analysis.
 *
 * Heuristic: a text change inserting more than 1 character (excluding newline/indent
 * from Enter key) is counted as a paste event.
 */

const PASTE_CHAR_THRESHOLD = 2;

interface FileMetrics {
  keystrokeCount: number;
  pasteCount: number;
  pasteCharCount: number;
  firstInputAt: string | null;
  lastInputAt: string | null;
}

export class InputMetricsTracker implements vscode.Disposable {
  private metrics = new Map<string, FileMetrics>();
  private disposable: vscode.Disposable;

  constructor() {
    this.disposable = vscode.workspace.onDidChangeTextDocument((e) => {
      this.handleDocumentChange(e);
    });
  }

  private handleDocumentChange(e: vscode.TextDocumentChangeEvent): void {
    const filePath = e.document.uri.fsPath;
    if (!filePath.includes('exercise_')) {
      return;
    }

    if (e.contentChanges.length === 0) {
      return;
    }

    const m = this.getOrCreate(filePath);
    const now = new Date().toISOString();

    if (!m.firstInputAt) {
      m.firstInputAt = now;
    }
    m.lastInputAt = now;

    for (const change of e.contentChanges) {
      const insertedText = change.text;

      // Empty text means deletion only — count as a keystroke (backspace/delete)
      if (insertedText.length === 0) {
        m.keystrokeCount += 1;
        continue;
      }

      // Single character or newline + auto-indent: treat as a keystroke
      const isNewlineWithIndent = /^\r?\n\s*$/.test(insertedText);
      if (insertedText.length <= PASTE_CHAR_THRESHOLD || isNewlineWithIndent) {
        m.keystrokeCount += 1;
        continue;
      }

      // Larger insertion — likely a paste
      m.pasteCount += 1;
      m.pasteCharCount += insertedText.length;
    }
  }

  private getOrCreate(filePath: string): FileMetrics {
    const key = filePath.toLowerCase();
    let m = this.metrics.get(key);
    if (!m) {
      m = {
        keystrokeCount: 0,
        pasteCount: 0,
        pasteCharCount: 0,
        firstInputAt: null,
        lastInputAt: null,
      };
      this.metrics.set(key, m);
    }
    return m;
  }

  /**
   * Build the InputMetrics snapshot for a file and reset its counters.
   */
  getAndReset(filePath: string, charCount: number): InputMetrics {
    const key = filePath.toLowerCase();
    const m = this.metrics.get(key);
    const now = new Date().toISOString();

    const result: InputMetrics = {
      keystrokeCount: m?.keystrokeCount ?? 0,
      pasteCount: m?.pasteCount ?? 0,
      pasteCharCount: m?.pasteCharCount ?? 0,
      editDurationMs: 0,
      charCount,
      firstInputAt: m?.firstInputAt ?? now,
      lastInputAt: m?.lastInputAt ?? now,
    };

    if (m?.firstInputAt && m?.lastInputAt) {
      result.editDurationMs = Math.max(
        0,
        new Date(m.lastInputAt).getTime() - new Date(m.firstInputAt).getTime()
      );
    }

    // Reset for next sync cycle
    this.metrics.delete(key);

    return result;
  }

  dispose(): void {
    this.disposable.dispose();
    this.metrics.clear();
  }
}
