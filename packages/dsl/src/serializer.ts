import type { BoardElement, EventStormingBoard } from '@miragon/event-storming-schema-model';

function r(n: number): string {
  return String(Math.round(n * 1000) / 1000);
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
    const base = el.label.trim().replace(/->/g, '→') || defaultName(el.elementType);
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

  for (const el of board.elements) {
    lines.push(elementLine(el, nameOf(el)));
  }

  // Arrows may reference notes/drawings only via saved JSON — fall back to the element label
  // for endpoint types that are not part of the unique-name pass.
  const labelsById = new Map(board.elements.map((el) => [el.id, el.label]));
  for (const edge of board.edges) {
    const from = names.get(edge.from) ?? labelsById.get(edge.from) ?? edge.from;
    const to = names.get(edge.to) ?? labelsById.get(edge.to) ?? edge.to;
    const annotation = edge.label ? `; ${edge.label}` : '';
    lines.push(`${from} -> ${to}${annotation}`);
  }

  // Config keywords were already emitted from the board above. A rawPassthrough entry with the
  // same keyword (e.g. an unparsable `style` line from externally-authored DSL) would otherwise
  // produce a contradictory duplicate line — drop it (config is the truth).
  if (board.rawPassthrough) {
    const emitted = new Set<string>(['title']);
    if (board.config.style) emitted.add('style');
    for (const raw of board.rawPassthrough) {
      if (emitted.has(raw.trim().split(/\s+/)[0]!)) continue;
      lines.push(raw);
    }
  }

  return lines.join('\n') + '\n';
}

function elementLine(el: BoardElement, name: string): string {
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
      return `${el.elementType} ${name} [${r(p.x)}, ${r(p.y)}]${colorSuffix(el)}`;
    case 'note':
      // Encode line breaks as literal `\n` -> the line-based DSL stays single-line.
      return `note ${name.replace(/\n/g, '\\n')} [${r(p.x)}, ${r(p.y)}]${colorSuffix(el)}`;
    case 'drawing': {
      // Project extension (freeform drawing): tuple list + style flags.
      const pts = el.points.map((q) => `[${r(q.x)}, ${r(q.y)}]`).join(', ');
      const closed = el.closed ? ' (closed)' : '';
      const stroke = el.strokeStyle && el.strokeStyle !== 'solid' ? ` (${el.strokeStyle})` : '';
      return `line [${pts}]${closed}${stroke}${colorSuffix(el)}`;
    }
  }
}
