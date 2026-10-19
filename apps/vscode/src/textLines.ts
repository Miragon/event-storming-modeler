/** A zero-based document position, independent of the `vscode` runtime (unit-testable). */
export interface LinePosition {
  line: number;
  character: number;
}

/** Replace the text between `start` and `end` with `text` (line breaks as '\n'). */
export interface LineEdit {
  start: LinePosition;
  end: LinePosition;
  text: string;
}

/** Splits into lines without their line breaks, the way `TextDocument.lineAt(i).text` reports them. */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\n/);
}

/**
 * The smallest whole-line edit that turns `oldText` into `newText`: common leading and trailing
 * lines stay untouched. A full-range replace would move every cursor of a side-by-side text editor
 * to the end of the file; touching only the changed lines keeps cursors and scroll position.
 * Returns undefined when only the line break style differs. The inserted text uses '\n', which
 * VS Code converts to the document's line break.
 */
export function minimalLineEdit(oldText: string, newText: string): LineEdit | undefined {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const oldCount = oldLines.length;
  const newCount = newLines.length;
  const shorter = Math.min(oldCount, newCount);

  let prefix = 0;
  while (prefix < shorter && oldLines[prefix] === newLines[prefix]) prefix++;
  if (prefix === oldCount && prefix === newCount) return undefined;

  let suffix = 0;
  while (
    suffix < shorter - prefix &&
    oldLines[oldCount - 1 - suffix] === newLines[newCount - 1 - suffix]
  ) {
    suffix++;
  }

  const inserted = newLines.slice(prefix, newCount - suffix);
  if (suffix > 0) {
    return {
      start: { line: prefix, character: 0 },
      end: { line: oldCount - suffix, character: 0 },
      text: inserted.map((line) => `${line}\n`).join(''),
    };
  }

  // The change reaches the last line, which has no line break of its own: anchor at the end of the
  // previous line so removed or added lines take their preceding break with them.
  const lastLine = oldCount - 1;
  const end = { line: lastLine, character: oldLines[lastLine]!.length };
  if (prefix === 0) return { start: { line: 0, character: 0 }, end, text: inserted.join('\n') };
  return {
    start: { line: prefix - 1, character: oldLines[prefix - 1]!.length },
    end,
    text: inserted.map((line) => `\n${line}`).join(''),
  };
}
