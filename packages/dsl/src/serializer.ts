import type {
  BoardElement,
  EventStormingBoard,
  NoteElement,
} from '@miragon/event-storming-schema-model';
import { ID_CHARSET_RE, slug } from './lexer.js';

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
 * Returns the DSL name per element ID for the referenceable types (the sticky kinds): the
 * escaped label, or the per-kind default for an empty one. Duplicate labels are legal — an
 * ambiguous name is disambiguated via an `(id …)` suffix plus `#id` references instead of
 * being silently renamed.
 */
function serializedNames(board: EventStormingBoard): Map<string, string> {
  const byId = new Map<string, string>();
  for (const el of board.elements) {
    if (!NAMED_TYPES.has(el.elementType)) continue;
    byId.set(el.id, escapeName(el.label) || defaultName(el.elementType));
  }
  return byId;
}

/** Color override extension: `(color …)` after the coordinates. */
function colorSuffix(el: { color?: string }): string {
  return el.color ? ` (color ${el.color})` : '';
}

/**
 * Alignment extension: `(align <horizontal> <vertical>)` — both words always emitted together
 * using the EFFECTIVE values, and only when at least one axis differs from the default
 * left/top, so existing boards serialize byte-identically.
 */
function alignSuffix(el: NoteElement): string {
  const horizontal = el.align?.horizontal ?? 'left';
  const vertical = el.align?.vertical ?? 'top';
  return horizontal === 'left' && vertical === 'top' ? '' : ` (align ${horizontal} ${vertical})`;
}

/**
 * Serializes an EventStormingBoard into `.storm` text. Deterministic; writes only syntax the
 * parser reads back. `rawPassthrough` is appended unchanged. Coordinates are `[x, y]` in board
 * pixels (x FIRST), rounded to 3 decimals.
 */
export function serializeDSL(board: EventStormingBoard): string {
  const lines: string[] = [];
  const names = serializedNames(board);
  const nameOf = (el: BoardElement): string => names.get(el.id) ?? el.label;

  // A `#…` token in a reference position always reads as an id — so a sticky whose serialized
  // name is AMBIGUOUS (shared by >= 2 stickies) or literally starts with `#` is declared with
  // an `(id …)` suffix and referenced as `#id`. Everything else stays purely name-based, so
  // unambiguous boards serialize without any ids, byte-identical to before.
  const nameCount = new Map<string, number>();
  for (const name of names.values()) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  const needsId = (id: string): boolean => {
    const name = names.get(id);
    return name !== undefined && (nameCount.get(name)! > 1 || name.startsWith('#'));
  };

  // Ids surface in the text only via needsId. An id outside the DSL id charset (possible in
  // JSON-authored boards) would emit unparsable syntax and lose the arrows on re-import — a
  // slug-based, collision-checked stand-in is substituted for the suffix AND every reference.
  const emitIds = new Map<string, string>();
  const taken = new Set(board.elements.map((e) => e.id));
  for (const el of board.elements) {
    if (!needsId(el.id) || ID_CHARSET_RE.test(el.id)) continue;
    let candidate = slug(el.id);
    for (let i = 2; taken.has(candidate); i++) candidate = `${slug(el.id)}_${i}`;
    taken.add(candidate);
    emitIds.set(el.id, candidate);
  }
  const idOf = (id: string): string => emitIds.get(id) ?? id;
  const ref = (id: string): string => (needsId(id) ? `#${idOf(id)}` : (names.get(id) ?? id));

  lines.push(`title ${board.config.title}`);
  if (board.config.style) lines.push(`style ${board.config.style}`);
  if (board.config.level) lines.push(`level ${board.config.level}`);

  // Pinning `(on …)` is ALWAYS the last suffix — the parser reads the host name up to the
  // line's final `)`, so host names containing parentheses survive. validateBoard guarantees
  // the host is a named sticky kind; `ref` falls back to the raw id purely defensively.
  const onSuffix = (el: BoardElement): string => {
    const hostId =
      el.elementType === 'actor' || el.elementType === 'hotspot' || el.elementType === 'note'
        ? el.attachedTo
        : undefined;
    return hostId ? ` (on ${ref(hostId)})` : '';
  };

  for (const el of board.elements) {
    const idSuffix = needsId(el.id) ? ` (id ${idOf(el.id)})` : '';
    lines.push(elementLine(el, nameOf(el), idSuffix, onSuffix(el)));
  }

  // validateBoard guarantees arrow endpoints are sticky kinds, so the name map always covers
  // them — `ref`'s raw-id fallback is purely defensive for unvalidated input.
  for (const edge of board.edges) {
    const annotation = edge.label ? `; ${edge.label}` : '';
    lines.push(`${ref(edge.from)} -> ${ref(edge.to)}${annotation}`);
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

function elementLine(el: BoardElement, name: string, idSuffix: string, attach: string): string {
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
      // Canonical suffix order: `(color …) (id …) (on …)` — `(on …)` stays last (see above).
      return `${el.elementType} ${name} [${r(p.x)}, ${r(p.y)}]${colorSuffix(el)}${idSuffix}${attach}`;
    case 'note': {
      // Escape line breaks/comment starters -> the line-based DSL stays single-line. `->` is
      // fine in note text (notes are never arrow endpoints), so no `→` replacement here.
      // Canonical note suffix order: `(color …) (size WxH) (align h v) (on …)` — `(on …)`
      // stays last (final-paren rule, see above); size/align/attachment are only present when
      // set, so plain boards stay byte-identical.
      const size = el.size ? ` (size ${r(el.size.width)}x${r(el.size.height)})` : '';
      return `note ${escapeText(name)} [${r(p.x)}, ${r(p.y)}]${colorSuffix(el)}${size}${alignSuffix(el)}${attach}`;
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
