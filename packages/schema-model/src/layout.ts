/** Pure layout helpers for the free Event Storming canvas (no persistence, no DOM). */

import type { BoardElement, EventStormingBoard } from './types.js';

/**
 * Default framing for an empty board in board pixels. Single source of truth for the
 * renderer's board-bounds service (fitView and SVG export fall back to it when the
 * board has no elements).
 */
export const DEFAULT_BOARD_SIZE = { width: 1080, height: 680 } as const;

/**
 * Elements in timeline order: sorted by `position.x`, then `position.y`, then `id`.
 * Pure and deterministic — mirrors how a facilitator reads a board left to right.
 */
export function sortByTimeline(board: EventStormingBoard): BoardElement[] {
  return [...board.elements].sort(
    (a, b) =>
      a.position.x - b.position.x || a.position.y - b.position.y || a.id.localeCompare(b.id),
  );
}
