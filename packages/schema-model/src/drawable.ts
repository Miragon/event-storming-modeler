import type { EventStormingBoard } from './types.js';

/**
 * The canvas places shapes with 32-bit SVG transforms, which overflow near 3.4e38 and would make
 * an import throw half-way; 1e38 leaves room for a corner half a note's size beyond its centre.
 */
export const LARGEST_DRAWABLE_NUMBER = 1e38;

const DRAWABLE_RANGE = `±${LARGEST_DRAWABLE_NUMBER.toExponential().replace('e+', 'e')}`;

/** A board with a coordinate or size the canvas cannot draw (beyond ±1e38). */
export class UndrawableBoardError extends RangeError {
  override readonly name = 'UndrawableBoardError';

  constructor(
    readonly elementId: string,
    /** Where the number sits in the element: `position.x`, `points[2].y`, `size.width`. */
    readonly field: string,
    readonly value: number,
  ) {
    super(
      `Element ${elementId}: ${field} ${value} lies beyond ${DRAWABLE_RANGE}, more than the canvas can draw.`,
    );
  }
}

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null;
}

function* pairOf(
  path: string,
  value: unknown,
  keys: readonly [string, string],
): Generator<readonly [string, unknown]> {
  if (!isFields(value)) return;
  for (const key of keys) yield [`${path}.${key}`, value[key]];
}

function* numbersOf(element: Fields): Generator<readonly [string, unknown]> {
  const { elementType, position, points, size } = element;
  yield* pairOf('position', position, ['x', 'y']);
  if (elementType === 'drawing' && Array.isArray(points)) {
    const pointList: readonly unknown[] = points;
    for (const [index, point] of pointList.entries()) {
      yield* pairOf(`points[${index}]`, point, ['x', 'y']);
    }
  }
  if (elementType === 'note') yield* pairOf('size', size, ['width', 'height']);
}

/**
 * Throws an `UndrawableBoardError` for the first coordinate or size beyond ±1e38. Takes elements
 * the schema has not checked yet too; one without an id to name is left to the schema.
 */
export function assertElementsDrawable(elements: unknown): void {
  if (!Array.isArray(elements)) return;
  const elementList: readonly unknown[] = elements;
  for (const element of elementList) {
    if (!isFields(element)) continue;
    const { id } = element;
    if (typeof id !== 'string' || id === '') continue;
    for (const [field, value] of numbersOf(element)) {
      // Negated so that NaN, which a board built in code can hold, is refused as well.
      if (typeof value === 'number' && !(Math.abs(value) <= LARGEST_DRAWABLE_NUMBER)) {
        throw new UndrawableBoardError(id, field, value);
      }
    }
  }
}

/** Throws an `UndrawableBoardError` for the first coordinate or size beyond ±1e38. */
export function assertDrawable(board: EventStormingBoard): void {
  assertElementsDrawable(board.elements);
}
