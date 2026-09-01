import type { BoardElement, EventStormingBoard } from '@miragon/event-storming-schema-model';

/**
 * Coordinate formatter: 3-decimal rounding, NEVER exponent notation — `String(1e21)` yields
 * `"1e+21"`, which the coordinate regex cannot read back. Magnitudes >= 1e21 are always
 * integer-valued doubles, so BigInt expands them losslessly (the rounding step is skipped
 * there; it would be a no-op and could overflow to Infinity for huge values).
 */
function r(n: number): string {
  const v = Math.abs(n) < 1e21 ? Math.round(n * 1000) / 1000 : n;
  return Math.abs(v) < 1e21 ? String(v) : BigInt(v).toString();
}

/**
 * Free text emitted into the line-based grammar: real line breaks become the literal `\n`
 * escape (decoded on parse) and comment starters are defused with the Unicode division slash
 * — otherwise the parser would split the line or strip the rest as a comment. `//` directly
 * after `:` stays untouched (URL scheme separator, the comment splitter is URL-aware).
 */
function escapeText(label: string): string {
  return label
    .trim()
    .replace(/\n/g, '\\n')
    .replace(/(?<!:)\/\//g, '∕∕')
    .replace(/\/\*/g, '∕*');
}

/** Names are additionally arrow-safe: a literal `->` inside a name would break `A -> B` lines. */
function escapeName(label: string): string {
  return escapeText(label).replace(/->/g, '→');
}

/** Types referenced BY THEIR NAME in the DSL (arrow endpoints + namespace) — all sticky kinds. */
const NAMED_TYPES: ReadonlySet<string> = new Set([
  'event',
  'command',
  'actor',
  'aggregate',
  'policy',
  'readmodel',
  'external',
  'hotspot',
]);

const DEFAULT_NAMES: Readonly<Record<string, string>> = {
  event: 'Domain Event',
  command: 'Command',
  actor: 'Actor',
  aggregate: 'Aggregate',
  policy: 'Policy',
  readmodel: 'Read Model',
  external: 'External System',
  hotspot: 'Hotspot',
};

function defaultName(type: string): string {
  return DEFAULT_NAMES[type] ?? 'Sticky';
}

/**
 * Returns a name per element ID that is UNIQUE within the DSL for the referenceable types
 * (the sticky kinds). Because arrows are serialized by name (`A -> B`), duplicate or empty
 * labels would collapse onto the same node on re-import and make arrows disappear. So on
 * collision a suffix (`Name 2`) is assigned and on an empty label a default — consistently for
 * BOTH sides (sticky line AND arrow reference). Unique names stay unchanged.
 */
function uniqueNames(board: EventStormingBoard): Map<string, string> {
  const used = new Set<string>();
  const byId = new Map<string, string>();
  for (const el of board.elements) {
    if (!NAMED_TYPES.has(el.elementType)) continue;
    const base = escapeName(el.label) || defaultName(el.elementType);
    let name = base;
    let i = 2;
    while (used.has(name)) name = `${base} ${i++}`;
    used.add(name);
    byId.set(el.id, name);
  }
  return byId;
}

/** Color override extension: `(color …)` after the coordinates. */
function colorSuffix(el: { color?: string }): string {
  return el.color ? ` (color ${el.color})` : '';
}

/**
 * Serializes an EventStormingBoard into `.storm` text. Deterministic; writes only syntax the
 * parser reads back. `rawPassthrough` is appended unchanged. Coordinates are `[x, y]` in board
 * pixels (x FIRST), rounded to 3 decimals.
 */
export function serializeDSL(board: EventStormingBoard): string {
  const lines: string[] = [];
  const names = uniqueNames(board);
  const nameOf = (el: BoardElement): string => names.get(el.id) ?? el.label;

  lines.push(`title ${board.config.title}`);
  if (board.config.style) lines.push(`style ${board.config.style}`);
  if (board.config.level) lines.push(`level ${board.config.level}`);

  // Pinning `(on …)` is ALWAYS the last suffix — the parser reads the host name up to the
  // line's final `)`, so host names containing parentheses survive. validateBoard guarantees
  // the host is a named sticky kind; the `?? attachedTo` fallback is purely defensive.
  const onSuffix = (el: BoardElement): string => {
    const hostId =
      el.elementType === 'actor' || el.elementType === 'hotspot' ? el.attachedTo : undefined;
    return hostId ? ` (on ${names.get(hostId) ?? hostId})` : '';
  };

  for (const el of board.elements) {
    lines.push(elementLine(el, nameOf(el), onSuffix(el)));
  }

  // validateBoard guarantees arrow endpoints are sticky kinds, so the unique-name pass always
  // covers them — the `?? edge.from` is purely defensive for unvalidated input.
  for (const edge of board.edges) {
    const from = names.get(edge.from) ?? edge.from;
    const to = names.get(edge.to) ?? edge.to;
    const annotation = edge.label ? `; ${edge.label}` : '';
    lines.push(`${from} -> ${to}${annotation}`);
  }

  // Config keywords were already emitted from the board above. A rawPassthrough entry with the
  // same keyword (e.g. an unparsable `style` line from externally-authored DSL) would otherwise
  // produce a contradictory duplicate line — drop it (config is the truth).
  if (board.rawPassthrough) {
    const emitted = new Set<string>(['title']);
    if (board.config.style) emitted.add('style');
    if (board.config.level) emitted.add('level');
    for (const raw of board.rawPassthrough) {
      if (emitted.has(raw.trim().split(/\s+/)[0]!)) continue;
      lines.push(raw);
    }
  }

  return lines.join('\n') + '\n';
}

function elementLine(el: BoardElement, name: string, attach: string): string {
  const p = el.position;
  switch (el.elementType) {
    case 'event':
    case 'command':
    case 'actor':
    case 'aggregate':
    case 'policy':
    case 'readmodel':
    case 'external':
    case 'hotspot':
      return `${el.elementType} ${name} [${r(p.x)}, ${r(p.y)}]${colorSuffix(el)}${attach}`;
    case 'note': {
      // Escape line breaks/comment starters -> the line-based DSL stays single-line. `->` is
      // fine in note text (notes are never arrow endpoints), so no `→` replacement here.
      // `(size WxH)` is ALWAYS the last suffix on note lines and only present for manually
      // sized notes — auto-sized boards stay byte-identical.
      const size = el.size ? ` (size ${r(el.size.width)}x${r(el.size.height)})` : '';
      return `note ${escapeText(name)} [${r(p.x)}, ${r(p.y)}]${colorSuffix(el)}${size}`;
    }
    case 'drawing': {
      // Project extension (freeform drawing): tuple list + style flags.
      const pts = el.points.map((q) => `[${r(q.x)}, ${r(q.y)}]`).join(', ');
      const closed = el.closed ? ' (closed)' : '';
      const stroke = el.strokeStyle && el.strokeStyle !== 'solid' ? ` (${el.strokeStyle})` : '';
      return `line [${pts}]${closed}${stroke}${colorSuffix(el)}`;
    }
  }
}
