import { describe, expect, it } from 'vitest';
import { minimalLineEdit, splitLines, type LineEdit } from '../src/textLines.js';

/** Applies a LineEdit to an LF text, the way VS Code applies the WorkspaceEdit. */
function apply(text: string, edit: LineEdit | undefined): string {
  if (!edit) return text;
  const lines = splitLines(text);
  const offset = (line: number, character: number) =>
    lines.slice(0, line).reduce((sum, current) => sum + current.length + 1, 0) + character;
  const start = offset(edit.start.line, edit.start.character);
  const end = offset(edit.end.line, edit.end.character);
  return text.slice(0, start) + edit.text + text.slice(end);
}

const CASES: ReadonlyArray<[name: string, before: string, after: string]> = [
  ['changes one line in the middle', 'a\nb\nc\n', 'a\nB\nc\n'],
  ['inserts a line', 'a\nc\n', 'a\nb\nc\n'],
  ['appends at the end', 'a\nb\n', 'a\nb\nc\n'],
  ['removes a line', 'a\nb\nc\n', 'a\nc\n'],
  ['changes the last line without a line break', 'a\nb', 'a\nc'],
  ['removes the last lines without a line break', 'a\nb\nc', 'a'],
  ['replaces everything', 'a\n', 'x\ny\n'],
  ['empties the document', 'a\nb\n', ''],
  ['fills an empty document', '', 'a\n'],
];

describe('minimalLineEdit', () => {
  it.each(CASES)('%s', (_name, before, after) => {
    expect(apply(before, minimalLineEdit(before, after))).toBe(after);
  });

  it('touches only the changed line', () => {
    expect(minimalLineEdit('a\nb\nc\n', 'a\nB\nc\n')).toEqual({
      start: { line: 1, character: 0 },
      end: { line: 2, character: 0 },
      text: 'B\n',
    });
  });

  it('returns undefined for an equal text and for a pure line break change', () => {
    expect(minimalLineEdit('a\nb\n', 'a\nb\n')).toBeUndefined();
    expect(minimalLineEdit('a\r\nb\r\n', 'a\nb\n')).toBeUndefined();
  });
});
