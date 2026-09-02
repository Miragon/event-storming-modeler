import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import { DEFAULT_BOARD_SIZE } from '@miragon/event-storming-schema-model';
import { ROOT_ID } from '../model/di-types.js';

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
 * Content bounds of the free Event Storming canvas — no rendering, no constraint. The single
 * bounds source for the SVG export viewBox and the apps' fitView (connections always run
 * between shapes, so the shape bbox covers everything).
 */
export default class BoardBounds {
  static $inject = ['elementRegistry'];

  constructor(private readonly elementRegistry: ElementRegistry) {}

  /**
   * Bounding box over all elements, padded on every side. An empty board falls back to the
   * schema-model default framing so fitView/export behave sensibly before the first sticky.
   */
  contentBounds(padding = 120): Bounds {
    const shapes = (this.elementRegistry.getAll() as ShapeLikeElement[]).filter(isPositionedShape);
    if (!shapes.length) return { x: 0, y: 0, ...DEFAULT_BOARD_SIZE };

    const minX = Math.min(...shapes.map((s) => s.x));
    const minY = Math.min(...shapes.map((s) => s.y));
    const maxX = Math.max(...shapes.map((s) => s.x + s.width));
    const maxY = Math.max(...shapes.map((s) => s.y + s.height));
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + 2 * padding,
      height: maxY - minY + 2 * padding,
    };
  }
}
