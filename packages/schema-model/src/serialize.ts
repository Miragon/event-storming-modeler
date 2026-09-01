import { eventStormingBoardSchema } from './schema.js';
import { migrate, CURRENT_SCHEMA_VERSION } from './migrations.js';
import { HOST_STICKY_KINDS } from './attachments.js';
import type { BoardConfig, EventStormingBoard } from './types.js';

/** Number of decimal places for coordinates in serialization. */
const COORD_PRECISION = 3;

// The 8 sticky kinds — the only legal arrow endpoints. Notes/drawings are annotations; the
// renderer's connection rules forbid them and the DSL cannot reference them, so accepting
// such edges here would mean silent loss on the next DSL round-trip.
const CONNECTABLE_TYPES: ReadonlySet<string> = new Set([
  'event',
  'command',
  'actor',
  'aggregate',
  'policy',
  'readmodel',
  'external',
  'hotspot',
]);

const HOST_TYPES: ReadonlySet<string> = new Set(HOST_STICKY_KINDS);

function round(n: number, digits = COORD_PRECISION): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/**
 * Validates arbitrary data against the schema plus additional cross-field invariants
 * (unique IDs, edge endpoints exist and are sticky kinds). Throws on violation.
 */
export function validateBoard(data: unknown): EventStormingBoard {
  const parsed = eventStormingBoardSchema.parse(data);

  const ids = new Set<string>();
  const typeById = new Map<string, string>();
  for (const el of parsed.elements) {
    if (ids.has(el.id)) throw new Error(`Duplicate element id: ${el.id}`);
    ids.add(el.id);
    typeById.set(el.id, el.elementType);
  }

  // Pinning: the host must exist and be of a host kind — actor/hotspot/note/drawing are never
  // hosts (no attach chains), which also rules out self-attachment.
  for (const el of parsed.elements) {
    if (!('attachedTo' in el) || el.attachedTo === undefined) continue;
    if (!ids.has(el.attachedTo)) {
      throw new Error(`Element ${el.id}: attachedTo "${el.attachedTo}" references no element.`);
    }
    if (!HOST_TYPES.has(typeById.get(el.attachedTo)!)) {
      throw new Error(
        `Element ${el.id}: attachedTo "${el.attachedTo}" is a ${typeById.get(el.attachedTo)} — actors/hotspots may only attach to host stickies.`,
      );
    }
  }

  // Shared ID namespace: diagram-js' ElementRegistry has only ONE namespace for
  // shapes and connections — an edge with an element ID would crash the import midway.
  const edgeIds = new Set<string>();
  for (const edge of parsed.edges) {
    if (edgeIds.has(edge.id)) throw new Error(`Duplicate edge id: ${edge.id}`);
    if (ids.has(edge.id)) throw new Error(`Edge id collides with element id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!ids.has(edge.from)) {
      throw new Error(`Edge ${edge.id}: source "${edge.from}" references no element.`);
    }
    if (!ids.has(edge.to)) {
      throw new Error(`Edge ${edge.id}: target "${edge.to}" references no element.`);
    }
    if (!CONNECTABLE_TYPES.has(typeById.get(edge.from)!)) {
      throw new Error(
        `Edge ${edge.id}: source "${edge.from}" is a ${typeById.get(edge.from)} — arrows may only connect stickies.`,
      );
    }
    if (!CONNECTABLE_TYPES.has(typeById.get(edge.to)!)) {
      throw new Error(
        `Edge ${edge.id}: target "${edge.to}" is a ${typeById.get(edge.to)} — arrows may only connect stickies.`,
      );
    }
  }

  return parsed as unknown as EventStormingBoard;
}

export function loadBoard(data: unknown): EventStormingBoard {
  return validateBoard(migrate(data));
}

export function parseBoardJSON(json: string): EventStormingBoard {
  return loadBoard(JSON.parse(json) as unknown);
}

/**
 * Deterministic serialization: stable (alphabetical) key order, elements/edges sorted by `id`,
 * coordinates rounded to 3 decimal places. Produces clean Git diffs and reliable change
 * detection.
 */
export function serializeBoard(board: EventStormingBoard): string {
  return stableStringify(canonicalize(board));
}

function canonicalize(board: EventStormingBoard): EventStormingBoard {
  const elements = [...board.elements]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((el) => roundNumbers(el) as EventStormingBoard['elements'][number]);
  const edges = [...board.edges].sort((a, b) => a.id.localeCompare(b.id));
  return {
    ...board,
    config: roundNumbers(board.config) as BoardConfig,
    elements,
    edges,
  };
}

function roundNumbers<T>(value: T): T {
  if (typeof value === 'number') return round(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => roundNumbers(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = roundNumbers(v);
    }
    return out as T;
  }
  return value;
}

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === 'object') {
      if (seen.has(v as object)) throw new Error('Cyclic reference in EventStormingBoard.');
      seen.add(v as object);
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        out[key] = sortDeep((v as Record<string, unknown>)[key]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(sortDeep(value), null, 2) + '\n';
}

export function createEmptyBoard(title = 'Untitled Board'): EventStormingBoard {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    config: { title },
    elements: [],
    edges: [],
  };
}
