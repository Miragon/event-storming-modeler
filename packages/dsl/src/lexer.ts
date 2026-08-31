/**
 * Small, line-oriented helpers for the Event Storming `.storm` DSL.
 * The DSL is line-based; a full tokenizer/generator is not needed.
 */

export interface ParsedCoords {
  readonly a: number;
  readonly b: number;
}

const COORDS_RE = /\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/;

/** Order stays raw (a, b). */
export function parseCoords(line: string): ParsedCoords | null {
  const m = COORDS_RE.exec(line);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return { a, b };
}

export function stripCoords(line: string): string {
  return line.replace(COORDS_RE, ' ');
}

/**
 * Splits a line at the first `[a, b]` tuple: name before, suffix after.
 * Extras like `(color …)` may then only be looked up in the suffix — parentheses
 * inside the name stay untouched.
 */
export function splitAtCoords(
  line: string,
): { name: string; coords: ParsedCoords; suffix: string } | null {
  const m = COORDS_RE.exec(line);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return {
    name: line.slice(0, m.index).trim(),
    coords: { a, b },
    suffix: line.slice(m.index + m[0].length),
  };
}

// `[^[\]]` (tuples cannot contain '[') + bounded whitespace keep the scan linear (ReDoS-safe).
const MULTI_COORDS_RE = /\[\s{0,8}(\[[^[\]]*\](?:\s{0,8},\s{0,8}\[[^[\]]*\])+)\s{0,8}\]/;

/** Extracts a tuple list `[[a,b],[c,d],…]` (freeform `line` drawing) — or null. */
export function parseMultiCoords(line: string): { tuples: ParsedCoords[]; rest: string } | null {
  const m = MULTI_COORDS_RE.exec(line);
  if (!m) return null;
  const tuples: ParsedCoords[] = [];
  const inner = /\[\s{0,8}([-\d.]+)\s{0,8},\s{0,8}([-\d.]+)\s{0,8}\]/g;
  let t: RegExpExecArray | null;
  while ((t = inner.exec(m[1]!))) {
    const a = Number(t[1]);
    const b = Number(t[2]);
    if (!Number.isNaN(a) && !Number.isNaN(b)) tuples.push({ a, b });
  }
  if (!tuples.length) return null;
  return { tuples, rest: line.replace(MULTI_COORDS_RE, ' ') };
}

/**
 * Splits off a `//` line comment. Quote-aware (`'//weird'` inside quotes stays untouched) and
 * URL-aware: `//` directly after `:` is a scheme separator (`https://…`), not a comment.
 */
export function splitLineComment(line: string): { code: string; comment: string | null } {
  let inQuote = false;
  for (let i = 0; i < line.length - 1; i++) {
    const ch = line[i];
    if (ch === "'") inQuote = !inQuote;
    else if (!inQuote && ch === '/' && line[i + 1] === '/' && line[i - 1] !== ':') {
      return { code: line.slice(0, i), comment: line.slice(i) };
    }
  }
  return { code: line, comment: null };
}

/** First occurrence of `needle` outside `'…'` quotes — or -1. */
export function indexOfOutsideQuotes(line: string, needle: string): number {
  let inQuote = false;
  for (let i = 0; i + needle.length <= line.length; i++) {
    const ch = line[i];
    if (ch === "'") {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && line.startsWith(needle, i)) return i;
  }
  return -1;
}

// Color override extension: `(color #rrggbb)` OR `(color green)`. Deliberately placed after
// the coordinates so parentheses inside sticky names are never mistaken for it.
// Accepts hex or CSS color names.
const COLOR_RE = /\(\s*color\s+(#[0-9a-fA-F]{3,8}|[a-zA-Z][\w-]*)\s*\)/i;

export function parseColor(line: string): { color?: string; rest: string } {
  const m = COLOR_RE.exec(line);
  if (!m || !m[1]) return { rest: line };
  return { color: m[1], rest: line.replace(COLOR_RE, ' ') };
}

/** First word (keyword) of a line, lowercased. */
export function keywordOf(line: string): string {
  const m = /^\s*([A-Za-z][\w-]*)/.exec(line);
  return m ? m[1]!.toLowerCase() : '';
}

export function slug(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_/, '')
      .replace(/_$/, '') || 'x'
  );
}
