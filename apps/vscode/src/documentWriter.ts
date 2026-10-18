import * as vscode from 'vscode';
import { minimalLineEdit } from './textLines.js';

/** Echo keys ignore the line break style: VS Code writes inserted '\n' as the document's EOL. */
function echoKey(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export interface WriteOptions {
  /**
   * Whether the resulting change is the webview's own (its canvas already shows it) and must not
   * come back as an `update`. "Insert example" passes false: the canvas learns about it through
   * the update, imports it and fits.
   */
  suppressEcho: boolean;
}

/**
 * Writes texts into one document, each as ONE minimal WorkspaceEdit, so every canvas change is one
 * undo step of the document's history (guide §13.5) and a side-by-side text editor keeps its
 * cursor. Writes run one at a time, each diffed against the document as it is by then: a range
 * computed before the previous edit landed would point at the wrong lines.
 */
export class DocumentWriter {
  // A set, not a single value: for edits A, B in quick succession EVERY echo must be suppressed,
  // regardless of the order in which the change events arrive.
  private readonly pendingEchoes = new Set<string>();
  private writes: Promise<unknown> = Promise.resolve();

  constructor(private readonly document: vscode.TextDocument) {}

  /** True (once) when the document's current text is the echo of an own write. */
  consumeEcho(): boolean {
    return this.pendingEchoes.delete(echoKey(this.document.getText()));
  }

  /** Queues `nextText(current document text)`; resolves to false when the document refused it. */
  write(nextText: (currentText: string) => string, options: WriteOptions): Promise<boolean> {
    const written = this.writes.then(() => this.apply(nextText(this.document.getText()), options));
    this.writes = written.catch(() => undefined);
    return written;
  }

  private async apply(text: string, options: WriteOptions): Promise<boolean> {
    const change = minimalLineEdit(this.document.getText(), text);
    if (!change) return true;
    // Registered before applyEdit, so the change event it causes is reliably recognized as an echo.
    const key = echoKey(text);
    if (options.suppressEcho) this.pendingEchoes.add(key);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      this.document.uri,
      new vscode.Range(
        change.start.line,
        change.start.character,
        change.end.line,
        change.end.character,
      ),
      change.text,
    );
    const applied = await vscode.workspace.applyEdit(edit).then(
      (accepted) => accepted,
      () => false,
    );
    if (!applied && options.suppressEcho) this.pendingEchoes.delete(key);
    return applied;
  }
}
