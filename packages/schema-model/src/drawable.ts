import type { BoardElement, EventStormingBoard } from './types.js';

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

function* numbersOf(element: BoardElement): Generator<readonly [string, number]> {
  yield ['position.x', element.position.x];
  yield ['position.y', element.position.y];
  if (element.elementType === 'drawing') {
    for (const [index, point] of element.points.entries()) {
      yield [`points[${index}].x`, point.x];
      yield [`points[${index}].y`, point.y];
    }
  }
  if (element.elementType === 'note' && element.size) {
    yield ['size.width', element.size.width];
    yield ['size.height', element.size.height];
  }
}

/** Throws an `UndrawableBoardError` for the first coordinate or size beyond ±1e38. */
export function assertDrawable(board: EventStormingBoard): void {
  for (const element of board.elements) {
    for (const [field, value] of numbersOf(element)) {
      // Negated so that NaN, which a board built in code can hold, is refused as well.
      if (!(Math.abs(value) <= LARGEST_DRAWABLE_NUMBER)) {
        throw new UndrawableBoardError(element.id, field, value);
      }
    }
  }
}
