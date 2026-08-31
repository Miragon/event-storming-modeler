import type { Coordinate, EventStormingBoard } from '@miragon/event-storming-schema-model';
import { updateElement, findElement } from './util.js';

export interface MoveDelta {
  readonly dx: number;
  readonly dy: number;
}

/** Pure function — no undo stack: returns a new board with the element centered at `position`. */
export function moveElement(
  board: EventStormingBoard,
  elementId: string,
  position: Coordinate,
): EventStormingBoard {
  const current = findElement(board, elementId);
  if (!current) throw new Error(`Element "${elementId}" not found.`);
  return moveBy(board, elementId, {
    dx: position.x - current.position.x,
    dy: position.y - current.position.y,
  });
}

/** Translates an element by a pixel delta. The canvas is free — any finite target is valid. */
export function moveBy(
  board: EventStormingBoard,
  elementId: string,
  { dx, dy }: MoveDelta,
): EventStormingBoard {
  return updateElement(board, elementId, (el) => {
    const position = { x: el.position.x + dx, y: el.position.y + dy };
    if (el.elementType === 'drawing') {
      // Drawing points are absolute board pixels and `position` mirrors the first point,
      // so the polyline must translate together with the position.
      return {
        ...el,
        position,
        points: el.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      };
    }
    return { ...el, position };
  });
}
