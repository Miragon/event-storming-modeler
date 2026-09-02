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

// Attachment extension: `(on <Host Name>)` — canonically the LAST suffix. The host name runs
// up to the line's FINAL ')', so names may themselves contain parentheses (`Payment (retry)`).
// Extracted BEFORE the other suffixes so a `(color …)` or `(size …)` inside a host name is
// never mistaken for one.
const ON_RE = /\(\s*on\s+/i;

export function parseOn(line: string): { host?: string; rest: string } {
  const m = ON_RE.exec(line);
  if (!m) return { rest: line };
  const start = m.index + m[0].length;
  const close = line.lastIndexOf(')');
  if (close < start) return { rest: line };
  const host = line.slice(start, close).trim();
  if (!host) return { rest: line };
  return { host, rest: `${line.slice(0, m.index)} ${line.slice(close + 1)}` };
}

// Internal-id extension: `(id <id>)` — emitted on sticky lines only when the name alone would
// be ambiguous. The charset is deliberately tight (letters/digits/underscore/hyphen) so an id
// can never collide with the line grammar (`)`/whitespace/`#` are all illegal).
export const ID_CHARSET_RE = /^[A-Za-z0-9_-]+$/;

const ID_RE = /\(\s*id\s+([A-Za-z0-9_-]+)\s*\)/i;

// Any `(id …)` group — catches malformed variants so the caller can report a diagnostic.
const ID_PRESENT_RE = /\(\s*id\b[^)]*\)/i;

export function parseId(line: string): {
  id?: string;
  /** The matched `(id …)` text when present but unreadable (illegal charset). */
  invalid?: string;
  rest: string;
} {
  const m = ID_RE.exec(line);
  if (m?.[1]) return { id: m[1], rest: line.replace(ID_RE, ' ') };
  const p = ID_PRESENT_RE.exec(line);
  if (!p) return { rest: line };
  return { invalid: p[0], rest: line.replace(ID_PRESENT_RE, ' ') };
}

// Resize extension: `(size <w>x<h>)` — canonically the last suffix before `(on …)` on note
// lines. The serializer emits no spaces around the `x`; the parser tolerates optional whitespace.
// Deliberately looked up only after the coordinates so `(size 1x1)` inside note text survives.
const SIZE_RE = /\(\s*size\s+([\d.]+)\s*x\s*([\d.]+)\s*\)/i;

// Any `(size …)` group — catches malformed variants so the caller can report a diagnostic.
const SIZE_PRESENT_RE = /\(\s*size\b[^)]*\)/i;

export function parseSize(line: string): {
  size?: { width: number; height: number };
  /** The matched `(size …)` text when present but unreadable (malformed or non-positive). */
  invalid?: string;
  rest: string;
} {
  const m = SIZE_RE.exec(line);
  if (m) {
    const width = Number(m[1]);
    const height = Number(m[2]);
    // Non-positive (or NaN from e.g. `1.2.3`) falls through to the malformed branch.
    if (width > 0 && height > 0) {
      return { size: { width, height }, rest: line.replace(SIZE_RE, ' ') };
    }
  }
  const p = SIZE_PRESENT_RE.exec(line);
  if (!p) return { rest: line };
  return { invalid: p[0], rest: line.replace(SIZE_PRESENT_RE, ' ') };
}

// Alignment extension: `(align <horizontal> <vertical>)` — canonically between `(size …)` and
// `(on …)` on note lines, both words always present. Values are matched case-insensitively and
// canonicalized to lowercase. Deliberately looked up only after the coordinates so an
// `(align center middle)` inside note text survives.
const ALIGN_RE = /\(\s*align\s+(left|center|right)\s+(top|middle|bottom)\s*\)/i;

// Any `(align …)` group — catches malformed variants so the caller can report a diagnostic.
const ALIGN_PRESENT_RE = /\(\s*align\b[^)]*\)/i;

export function parseAlign(line: string): {
  align?: {
    horizontal: 'left' | 'center' | 'right';
    vertical: 'top' | 'middle' | 'bottom';
  };
  /** The matched `(align …)` text when present but unreadable (unknown/missing axis words). */
  invalid?: string;
  rest: string;
} {
  const m = ALIGN_RE.exec(line);
  if (m) {
    return {
      align: {
        horizontal: m[1]!.toLowerCase() as 'left' | 'center' | 'right',
        vertical: m[2]!.toLowerCase() as 'top' | 'middle' | 'bottom',
      },
      rest: line.replace(ALIGN_RE, ' '),
    };
  }
  const p = ALIGN_PRESENT_RE.exec(line);
  if (!p) return { rest: line };
  return { invalid: p[0], rest: line.replace(ALIGN_PRESENT_RE, ' ') };
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
