import type { BoardElement, EventStormingBoard } from '@miragon/event-storming-schema-model';

export function updateElement(
  board: EventStormingBoard,
  id: string,
  updater: (el: BoardElement) => BoardElement,
): EventStormingBoard {
  let found = false;
  const elements = board.elements.map((el) => {
    if (el.id !== id) return el;
    found = true;
    return updater(el);
  });
  if (!found) throw new Error(`Element "${id}" not found.`);
  return { ...board, elements };
}

export function findElement(board: EventStormingBoard, id: string): BoardElement | undefined {
  return board.elements.find((el) => el.id === id);
}

/** Removes `undefined` values so exactOptionalPropertyTypes is not violated. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}
