import type { BoardElement, EventStormingBoard } from '@miragon/event-storming-schema-model';
import { updateElement, compact } from './util.js';

/** Sets the element's color override (CSS color, typically a hex sticky fill). */
export function setColor(
  board: EventStormingBoard,
  elementId: string,
  color: string,
): EventStormingBoard {
  return updateElement(board, elementId, (el) => ({ ...el, color }));
}

/** Removes the color override so the element falls back to its per-kind default fill. */
export function clearColor(board: EventStormingBoard, elementId: string): EventStormingBoard {
  // compact drops the undefined value, so the `color` key is deleted rather than kept as undefined.
  return updateElement(
    board,
    elementId,
    (el) => compact({ ...el, color: undefined }) as unknown as BoardElement,
  );
}
