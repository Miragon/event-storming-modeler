import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import { DEFAULT_BOARD_SIZE } from '@miragon/event-storming-schema-model';
import { ROOT_ID, isEventStormingConnection } from '../model/di-types.js';
import { drawnShapeBox, linkLabelBox } from '../draw/index.js';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ShapeLikeElement {
  id: string;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  waypoints?: unknown;
  eventStormingType?: unknown;
}

function isPositionedShape(
  el: ShapeLikeElement,
): el is ShapeLikeElement & { x: number; y: number; width: number; height: number } {
  return (
    el.id !== ROOT_ID &&
    !el.waypoints &&
    typeof el.x === 'number' &&
    typeof el.y === 'number' &&
    typeof el.width === 'number' &&
    typeof el.height === 'number'
  );
}

/**
 * Content bounds of the free Event Storming canvas: every shape, a hotspot with its tilt, and every
 * arrow's annotation, which stands between two stickies and can reach far past both. The single
 * bounds source for the SVG export viewBox, the importer's fit and `contentBounds()`.
 */
export default class BoardBounds {
  static $inject = ['elementRegistry'];

  constructor(private readonly elementRegistry: ElementRegistry) {}

  /**
   * Bounding box over everything the board draws, padded on every side. An empty board falls back
   * to the schema-model default framing so fitView/export behave sensibly before the first sticky.
   */
  contentBounds(padding = 120): Bounds {
    const boxes = this.drawnBoxes();
    if (!boxes.length) return { x: 0, y: 0, ...DEFAULT_BOARD_SIZE };

    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + 2 * padding,
      height: maxY - minY + 2 * padding,
    };
  }

  /** No element on the board: `contentBounds` is only the default framing then. */
  isEmpty(): boolean {
    return this.positionedShapes().length === 0;
  }

  private drawnBoxes(): Bounds[] {
    const boxes: Bounds[] = this.positionedShapes().map(drawnShapeBox);
    for (const element of this.elementRegistry.getAll()) {
      if (!isEventStormingConnection(element)) continue;
      const label = linkLabelBox(element);
      if (label) boxes.push(label);
    }
    return boxes;
  }

  private positionedShapes() {
    return (this.elementRegistry.getAll() as ShapeLikeElement[]).filter(isPositionedShape);
  }
}
