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
 * Id prefixes matching the DSL parser's allocator (event_/cmd_/…) plus note/drawing — ids can
 * surface in the `.storm` text (`(id …)` suffix, `#id` references) once labels are duplicated,
 * so interactively created elements must not carry diagram-js `shape_N` ids.
 */
const ID_PREFIXES: Readonly<Record<EventStormingShapeType, string>> = {
  event: 'event',
  command: 'cmd',
  actor: 'actor',
  aggregate: 'agg',
  policy: 'policy',
  readmodel: 'read',
  external: 'ext',
  hotspot: 'hot',
  note: 'note',
  drawing: 'draw',
};

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
   * Returns a unique label: `base`, otherwise `base 2`, `base 3`, … Duplicate labels are legal
   * (the DSL disambiguates via ids) — the numbering is pure UX so consecutive palette creates
   * read "Domain Event 2" instead of piling up identical defaults.
   */
  uniqueLabel(base: string): string {
    const taken = new Set<string>();
    for (const el of this.elementRegistry.getAll()) {
      const lbl = (el as { eventStormingLabel?: unknown }).eventStormingLabel;
      if (typeof lbl === 'string') taken.add(lbl);
    }
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base} ${i}`)) i++;
    return `${base} ${i}`;
  }

  /**
   * DSL-style id `<kind-prefix>_<n>` for interactively created elements, collision-checked
   * against the elementRegistry. `reserved` covers ids handed out for the same batch before
   * anything is placed (e.g. a multi-shape paste — the clones are not in the registry yet).
   */
  allocateId(type: EventStormingShapeType, reserved?: ReadonlySet<string>): string {
    const prefix = ID_PREFIXES[type];
    for (let i = 1; ; i++) {
      const id = `${prefix}_${i}`;
      if (!this.elementRegistry.get(id) && !reserved?.has(id)) return id;
    }
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
    // A manual `size` (the user resized the note by hand) wins over the text metrics.
    // Centered on the position (consistent with the center back-calculation on export).
    const { width, height } = el.size ?? noteMetrics(el.label);
    // Alignment DI props stay canonical: default axes (left/top) are absent, mirroring the
    // model's canonical form — so the exporter emits `align` only for real deviations.
    const horizontal = el.align?.horizontal;
    const vertical = el.align?.vertical;
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
      ...(horizontal && horizontal !== 'left' ? { alignHorizontal: horizontal } : {}),
      ...(vertical && vertical !== 'top' ? { alignVertical: vertical } : {}),
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
      id: extra.id ?? this.allocateId('drawing'),
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
    // Numbered default labels ("Domain Event 2") are pure UX — see uniqueLabel.
    const label = this.uniqueLabel(rawLabel);
    const { width, height } = isStickyKind(type) ? STICKY_STYLES[type] : noteMetrics(label);
    const shape = this.elementFactory.createShape({
      id: this.allocateId(type),
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
