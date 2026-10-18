import * as vscode from 'vscode';
import { parseDSLWithDiagnostics } from '@miragon/event-storming-dsl';
import { splitLines } from './textLines.js';

export const DIAGNOSTIC_COLLECTION_NAME = 'event-storming';

/**
 * The parser is lenient: a typo or a dangling arrow keeps the line (it survives the round trip)
 * instead of failing the whole board. Its findings are therefore warnings, never errors, and the
 * canvas stays editable (guide §13.5: diagnostics with a model are problems, not an invalid file).
 */
export function boardDiagnostics(text: string): vscode.Diagnostic[] {
  const lines = splitLines(text);
  const lastLine = lines.length - 1;
  return parseDSLWithDiagnostics(text).diagnostics.map((finding) => {
    const lineIndex = Math.min(Math.max(finding.line - 1, 0), lastLine);
    const lineText = lines[lineIndex] ?? '';
    const firstCharacter = lineText.length - lineText.trimStart().length;
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(lineIndex, firstCharacter, lineIndex, lineText.length),
      finding.message,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = DIAGNOSTIC_COLLECTION_NAME;
    return diagnostic;
  });
}
