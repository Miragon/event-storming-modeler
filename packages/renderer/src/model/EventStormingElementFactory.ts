import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type {
  BoardEdge,
  BoardElement,
  DrawingElement,
  NoteElement,
} from '@miragon/event-storming-schema-model';
import { STICKY_STYLES, noteMetrics } from '../draw/styles.js';
import {
  isStickyKind,
  type EventStormingConnection,
  type EventStormingShape,
  type EventStormingShapeType,
} from './di-types.js';

/**
 * Creates diagram-js runtime elements with Event Storming markers. Schema positions are element
 * CENTERS in board pixels — converted to diagram-js top-left via the per-kind width/height.
 */
export default class EventStormingElementFactory {
  static $inject = ['elementFactory', 'elementRegistry'];

  constructor(
    private readonly elementFactory: ElementFactory,
    private readonly elementRegistry: ElementRegistry,
  ) {}

  /**
   * Returns a unique label: `base`, otherwise `base 2`, `base 3`, … Unique labels are mandatory
   * because the `.storm` DSL references elements BY THEIR NAME — duplicate names would cause ID
   * collisions on serialize/re-import and lose arrows.
   *
   * @param excludeId optional ID of the element currently being renamed (does NOT count its own
   *        current name as a collision — otherwise every rename would add a suffix).
   */
  uniqueLabel(base: string, excludeId?: string): string {
    const taken = new Set<string>();
    for (const el of this.elementRegistry.getAll()) {
      if (excludeId && el.id === excludeId) continue;
      const lbl = (el as { eventStormingLabel?: unknown }).eventStormingLabel;
      if (typeof lbl === 'string') taken.add(lbl);
    }
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  /** Builds a fixed-size sticky from a schema element (position = center). */
  createSticky(el: BoardElement): EventStormingShape {
    if (!isStickyKind(el.elementType)) {
      throw new Error(`not a sticky kind: ${el.elementType}`);
    }
    const { width, height } = STICKY_STYLES[el.elementType];
    const shape = this.elementFactory.createShape({
      id: el.id,
      x: el.position.x - width / 2,
      y: el.position.y - height / 2,
      width,
      height,
      eventStormingType: el.elementType,
      eventStormingLabel: el.label,
      businessObject: el,
      ...(el.color ? { color: el.color } : {}),
    });
    return shape as unknown as EventStormingShape;
  }

  createNote(el: NoteElement): EventStormingShape {
    // Note box grows with the (possibly multiline) text -> move/click hitbox covers the text.
    // Centered on the position (consistent with the center back-calculation on export).
    const { width, height } = noteMetrics(el.label);
    const shape = this.elementFactory.createShape({
      id: el.id,
      x: el.position.x - width / 2,
      y: el.position.y - height / 2,
      width,
      height,
      eventStormingType: 'note',
      eventStormingLabel: el.label,
      businessObject: el,
      ...(el.color ? { color: el.color } : {}),
    });
    return shape as unknown as EventStormingShape;
  }

  createDrawing(el: DrawingElement): EventStormingShape {
    return this.drawingFromCanvasPoints([...el.points], {
      id: el.id,
      ...(el.closed ? { closed: true } : {}),
      ...(el.strokeStyle ? { strokeStyle: el.strokeStyle } : {}),
      ...(el.color ? { color: el.color } : {}),
      businessObject: el,
    });
  }

  /** Builds a drawing shape from ABSOLUTE canvas points (bbox shape + relative points). */
  drawingFromCanvasPoints(
    canvasPoints: ReadonlyArray<{ x: number; y: number }>,
    extra: {
      id?: string;
      closed?: boolean;
      strokeStyle?: DrawingElement['strokeStyle'];
      color?: string;
      businessObject?: DrawingElement;
    } = {},
  ): EventStormingShape {
    const xs = canvasPoints.map((p) => p.x);
    const ys = canvasPoints.map((p) => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(Math.max(...xs) - x, 4);
    const height = Math.max(Math.max(...ys) - y, 4);
    const shape = this.elementFactory.createShape({
      ...(extra.id ? { id: extra.id } : {}),
      x,
      y,
      width,
      height,
      eventStormingType: 'drawing',
      eventStormingLabel: '',
      drawingPoints: canvasPoints.map((p) => ({ x: p.x - x, y: p.y - y })),
      ...(extra.closed ? { closed: true } : {}),
      ...(extra.strokeStyle ? { strokeStyle: extra.strokeStyle } : {}),
      ...(extra.color ? { color: extra.color } : {}),
      ...(extra.businessObject ? { businessObject: extra.businessObject } : {}),
    });
    return shape as unknown as EventStormingShape;
  }

  /** Palette/keyboard create: sized per kind, position comes from the drop point. */
  createNew(type: EventStormingShapeType, rawLabel: string): EventStormingShape {
    // Enforce a unique label -> lossless DSL round-trip (see uniqueLabel).
    const label = this.uniqueLabel(rawLabel);
    const { width, height } = isStickyKind(type) ? STICKY_STYLES[type] : noteMetrics(label);
    const shape = this.elementFactory.createShape({
      width,
      height,
      eventStormingType: type,
      eventStormingLabel: label,
    });
    return shape as unknown as EventStormingShape;
  }

  createArrow(
    edge: BoardEdge,
    source: EventStormingShape,
    target: EventStormingShape,
  ): EventStormingConnection {
    const conn = this.elementFactory.createConnection({
      id: edge.id,
      source,
      target,
      waypoints: [centerOf(source), centerOf(target)],
      eventStormingType: 'arrow',
      ...(edge.label ? { linkLabel: edge.label } : {}),
      businessObject: edge,
    });
    return conn as unknown as EventStormingConnection;
  }
}

function centerOf(shape: EventStormingShape): { x: number; y: number } {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}
