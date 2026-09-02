import { sortByTimeline, type EventStormingBoard } from '@miragon/event-storming-schema-model';
import { isStickyElementType, type StickyElementType } from './kind.js';

/**
 * Per-kind lane centers (board pixels, top → bottom) for the classic picture-that-explains-
 * everything row layout. Command and aggregate share the middle lane.
 */
const LANE_Y: Readonly<Record<StickyElementType, number>> = {
  readmodel: 120,
  actor: 220,
  command: 320,
  aggregate: 320,
  event: 420,
  policy: 520,
  external: 620,
  hotspot: 720,
};

/**
 * Snaps every sticky's y to its per-kind lane, preserving x.
 * Notes and drawings are free annotations and stay untouched.
 */
export function alignToRows(board: EventStormingBoard): EventStormingBoard {
  const elements = board.elements.map((el) =>
    isStickyElementType(el.elementType)
      ? { ...el, position: { x: el.position.x, y: LANE_Y[el.elementType] } }
      : el,
  );
  return { ...board, elements };
}

export interface SpreadTimelineOptions {
  /** Horizontal distance between neighboring stickies in board pixels. */
  readonly gap?: number;
}

/**
 * Redistributes the stickies' x evenly in timeline order (see `sortByTimeline`), starting at
 * the current leftmost sticky, preserving each y. Notes and drawings stay untouched.
 */
export function spreadTimeline(
  board: EventStormingBoard,
  { gap = 180 }: SpreadTimelineOptions = {},
): EventStormingBoard {
  const stickies = sortByTimeline(board).filter((el) => isStickyElementType(el.elementType));
  if (stickies.length === 0) return board;
  const startX = Math.min(...stickies.map((el) => el.position.x));
  const targetX = new Map<string, number>();
  stickies.forEach((el, index) => targetX.set(el.id, startX + index * gap));
  const elements = board.elements.map((el) => {
    const x = targetX.get(el.id);
    return x === undefined ? el : { ...el, position: { x, y: el.position.y } };
  });
  return { ...board, elements };
}
