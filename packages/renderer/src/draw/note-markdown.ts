/**
 * The tiny Markdown subset stored inside note labels (notes only — stickies stay plain):
 * `**bold**`, `*italic*`, `***bold italic***` inline runs and `- ` bullet lines. The label
 * stays ONE string in the model/DSL — this module is the single translation point between
 * that string and styled runs (renderer + WYSIWYG editor). Unmatched markers are literal
 * text: parsing never throws and never eats characters. `serialize(parse(x))` is a fixed
 * point for canonical input; non-canonical input canonicalizes in one parse→serialize cycle
 * and is then stable.
 */

export interface NoteRun {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
}

export interface NoteLine {
  /** Line started with the `- ` marker (stripped from the runs). */
  readonly bullet: boolean;
  readonly runs: NoteRun[];
}

// Longest marker first: `***` must win over `**`/`*` so the combined form parses as one run.
const MARKERS = [
  { marker: '***', bold: true, italic: true },
  { marker: '**', bold: true, italic: false },
  { marker: '*', bold: false, italic: true },
] as const;

/** One entry per '\n' line; bullet lines have the `- ` marker stripped. */
export function parseNoteMarkdown(label: string): NoteLine[] {
  return label.split('\n').map((raw) => {
    const bullet = raw.startsWith('- ');
    return { bullet, runs: parseInline(bullet ? raw.slice(2) : raw) };
  });
}

/** Exact inverse of `parseNoteMarkdown`: canonical markers, adjacent same-style runs merged. */
export function serializeNoteMarkdown(lines: NoteLine[]): string {
  return lines
    .map((line) => {
      const text = mergeRuns(line.runs)
        .map((run) => {
          const marker = run.bold && run.italic ? '***' : run.bold ? '**' : run.italic ? '*' : '';
          return marker + run.text + marker;
        })
        .join('');
      return (line.bullet ? '- ' : '') + text;
    })
    .join('\n');
}

/** Markers stripped, bullets as '• ' prefix — the string the text measurement sees. */
export function plainNoteText(label: string): string {
  return parseNoteMarkdown(label)
    .map((line) => (line.bullet ? '• ' : '') + line.runs.map((run) => run.text).join(''))
    .join('\n');
}

function parseInline(text: string): NoteRun[] {
  const runs: NoteRun[] = [];
  let literal = '';
  const flushLiteral = () => {
    if (literal) runs.push({ text: literal, bold: false, italic: false });
    literal = '';
  };
  let i = 0;
  while (i < text.length) {
    const span = text[i] === '*' ? matchSpan(text, i) : undefined;
    if (!span) {
      literal += text[i];
      i++;
      continue;
    }
    flushLiteral();
    runs.push({ text: span.content, bold: span.bold, italic: span.italic });
    i = span.end;
  }
  flushLiteral();
  return mergeRuns(runs);
}

/**
 * A styled span starting at `i`: the longest opening marker with a same-length closer and
 * non-empty content. Only the FIRST closer counts (no backtracking) — inner `*` characters
 * become literal content, which re-serializes to the same string (the one-cycle stability
 * guarantee above).
 */
function matchSpan(
  text: string,
  i: number,
): { content: string; bold: boolean; italic: boolean; end: number } | undefined {
  for (const { marker, bold, italic } of MARKERS) {
    if (!text.startsWith(marker, i)) continue;
    const close = text.indexOf(marker, i + marker.length);
    if (close <= i + marker.length) continue; // no closer (-1) or empty content
    return {
      content: text.slice(i + marker.length, close),
      bold,
      italic,
      end: close + marker.length,
    };
  }
  return undefined;
}

/** Drops empty runs and joins style-identical neighbors — the canonical run form. */
function mergeRuns(runs: NoteRun[]): NoteRun[] {
  const merged: Array<{ text: string; bold: boolean; italic: boolean }> = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = merged[merged.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic) last.text += run.text;
    else merged.push({ text: run.text, bold: run.bold, italic: run.italic });
  }
  return merged;
}
