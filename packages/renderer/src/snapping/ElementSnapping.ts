import type EventBus from 'diagram-js/lib/core/EventBus';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import { isEventStormingShape, type EventStormingShape } from '../model/di-types.js';

const SNAP_TOLERANCE = 8;

interface DragMoveEvent {
  x?: number;
  y?: number;
  /** Delta since drag start — diagram-js move/create works ONLY with dx/dy, never with x/y. */
  dx?: number;
  dy?: number;
  originalEvent?: { shiftKey?: boolean };
  context?: {
    shape?: { id?: string; x: number; y: number; width: number; height: number };
    shapes?: Array<{ id?: string }>;
  };
}

interface Point {
  x: number;
  y: number;
}

/**
 * Snaps a sticky's CENTER to nearby stickies' center x/y while moving or creating, so event
 * chains line up into clean timeline rows/columns without a grid. Each axis snaps independently
 * to the closest candidate within the tolerance. Disabled while the Shift key is held.
 * Important: the coordinate and its delta must be adjusted TOGETHER (like diagram-js'
 * `setSnapped`) — move takes the final position from `dx`/`dy`, so a mutated `x` alone would
 * have no effect.
 */
export default class ElementSnapping {
  static $inject = ['eventBus', 'elementRegistry'];

  constructor(eventBus: EventBus, elementRegistry: ElementRegistry) {
    const candidateCenters = (excludeIds: ReadonlySet<string>): Point[] =>
      elementRegistry
        .getAll()
        .filter(
          (el): el is EventStormingShape =>
            isEventStormingShape(el) &&
            el.eventStormingType !== 'drawing' &&
            !excludeIds.has(el.id),
        )
        .map((s) => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 }));

    const closest = (value: number, candidates: number[]): number | undefined => {
      let best: number | undefined;
      let bestDist = SNAP_TOLERANCE + 1;
      for (const c of candidates) {
        const dist = Math.abs(c - value);
        if (dist <= SNAP_TOLERANCE && dist < bestDist) {
          best = c;
          bestDist = dist;
        }
      }
      return best;
    };

    // Move: snap the SHAPE MIDPOINT (not the cursor) — the user rarely grabs the sticky
    // exactly at its centre.
    eventBus.on(['shape.move.move', 'shape.move.end'], 1500, (event: DragMoveEvent) => {
      if (event.originalEvent?.shiftKey) return;
      if (
        typeof event.x !== 'number' ||
        typeof event.dx !== 'number' ||
        typeof event.y !== 'number' ||
        typeof event.dy !== 'number'
      )
        return;
      const shape = event.context?.shape;
      if (!shape) return;
      const moving = new Set<string>(
        (event.context?.shapes ?? [shape]).map((s) => s.id ?? '').filter(Boolean),
      );
      const centers = candidateCenters(moving);
      const midX = shape.x + shape.width / 2 + event.dx;
      const midY = shape.y + shape.height / 2 + event.dy;

      const snapX = closest(
        midX,
        centers.map((c) => c.x),
      );
      if (snapX !== undefined) {
        const d = snapX - midX;
        event.dx += d;
        event.x += d;
      }
      const snapY = closest(
        midY,
        centers.map((c) => c.y),
      );
      if (snapY !== undefined) {
        const d = snapY - midY;
        event.dy += d;
        event.y += d;
      }
    });

    // Create (cursor = shape midpoint): snap the cursor to nearby sticky centers.
    eventBus.on(['create.move', 'create.end'], 1500, (event: DragMoveEvent) => {
      if (event.originalEvent?.shiftKey) return;
      const centers = candidateCenters(new Set());
      if (typeof event.x === 'number') {
        const snapX = closest(
          event.x,
          centers.map((c) => c.x),
        );
        if (snapX !== undefined) {
          if (typeof event.dx === 'number') event.dx += snapX - event.x;
          event.x = snapX;
        }
      }
      if (typeof event.y === 'number') {
        const snapY = closest(
          event.y,
          centers.map((c) => c.y),
        );
        if (snapY !== undefined) {
          if (typeof event.dy === 'number') event.dy += snapY - event.y;
          event.y = snapY;
        }
      }
    });
  }
}
