import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type Create from 'diagram-js/lib/features/create/Create';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Mouse from 'diagram-js/lib/features/mouse/Mouse';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Element, Shape } from 'diagram-js/lib/model/Types';
import {
  isEventStormingConnection,
  isEventStormingShape,
  type EventStormingConnection,
  type EventStormingShape,
  type EventStormingShapeType,
} from '../model/di-types.js';
import type EventStormingElementFactory from '../model/EventStormingElementFactory.js';

/** Offset (px) accumulated per paste operation. */
const PASTE_OFFSET = 24;

interface ShapeSnapshot {
  readonly props: Record<string, unknown>;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  /** Pinning: index of the copied HOST within the batch — absent if the host was not copied. */
  readonly hostIdx?: number;
}
interface ConnectionSnapshot {
  readonly sourceIdx: number;
  readonly targetIdx: number;
  readonly props: Record<string, unknown>;
}

/** Event Storming properties carried along when copying (geometry handled separately). */
const SHAPE_PROPS = [
  'eventStormingType',
  'color',
  'drawingPoints',
  'closed',
  'strokeStyle',
  'alignHorizontal',
  'alignVertical',
] as const;
const CONNECTION_PROPS = ['eventStormingType', 'linkLabel'] as const;

function snapshotProps(
  el: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = el[key];
    if (value !== undefined) out[key] = structuredClone(value);
  }
  return out;
}

/**
 * Custom copy/paste for Event Storming elements: copies the selection including the connections
 * BETWEEN selected shapes. Clones keep their labels verbatim — duplicate labels are legal, the
 * DSL disambiguates via `(id …)`/`#id` — and get fresh DSL-style ids.
 * Paste attaches the clones to the cursor like palette create (live preview, click places,
 * Escape cancels); duplicate inserts immediately with an offset. Either way the insert is ONE
 * undoable `elements.create` command.
 */
export default class EventStormingCopyPaste {
  static $inject = [
    'selection',
    'modeling',
    'elementFactory',
    'eventStormingElementFactory',
    'canvas',
    'create',
    'mouse',
  ];

  private clipboard: { shapes: ShapeSnapshot[]; connections: ConnectionSnapshot[] } | null = null;
  private pasteCount = 0;

  constructor(
    private readonly selection: Selection,
    private readonly modeling: Modeling,
    private readonly elementFactory: ElementFactory,
    private readonly esFactory: EventStormingElementFactory,
    private readonly canvas: Canvas,
    private readonly create: Create,
    private readonly mouse: Mouse,
  ) {}

  /** Copies the current selection. Returns false if nothing copyable is selected. */
  copy(): boolean {
    const selected = this.selection.get() as Element[];
    const shapes = selected.filter((el) => isEventStormingShape(el)) as EventStormingShape[];
    if (!shapes.length) return false;

    const indexOf = new Map<EventStormingShape, number>(shapes.map((s, i) => [s, i]));
    const connections: ConnectionSnapshot[] = [];
    const seen = new Set<EventStormingConnection>();
    for (const shape of shapes) {
      for (const conn of [...(shape.incoming ?? []), ...(shape.outgoing ?? [])]) {
        if (!isEventStormingConnection(conn) || seen.has(conn)) continue;
        const sourceIdx = indexOf.get(conn.source as unknown as EventStormingShape);
        const targetIdx = indexOf.get(conn.target as unknown as EventStormingShape);
        if (sourceIdx === undefined || targetIdx === undefined) continue;
        seen.add(conn);
        connections.push({
          sourceIdx,
          targetIdx,
          props: snapshotProps(conn as unknown as Record<string, unknown>, CONNECTION_PROPS),
        });
      }
    }

    this.clipboard = {
      shapes: shapes.map((s) => {
        // Attachment survives the copy only when the HOST is copied along (like the internal
        // connections); a lone attacher pastes detached.
        const hostIdx = s.host ? indexOf.get(s.host as unknown as EventStormingShape) : undefined;
        return {
          props: snapshotProps(s as unknown as Record<string, unknown>, SHAPE_PROPS),
          x: s.x,
          y: s.y,
          width: s.width,
          height: s.height,
          label: s.eventStormingLabel ?? '',
          ...(hostIdx !== undefined ? { hostIdx } : {}),
        };
      }),
      connections,
    };
    this.pasteCount = 0;
    return true;
  }

  /**
   * Paste with placement preview: the clones attach to the cursor exactly like palette create —
   * click places them, Escape cancels. Falls back to an offset insert when the mouse position
   * is unknown (e.g. paste before the pointer ever entered the canvas).
   */
  paste(): boolean {
    if (!this.clipboard?.shapes.length) return false;
    const clones = this.buildClones();
    const lastMove = this.mouse.getLastMoveEvent();
    if (lastMove) {
      this.create.start(lastMove, [...clones.shapes, ...clones.connections] as Element[]);
      return true;
    }
    return this.insertWithOffset(clones);
  }

  /** Copy + immediate offset insert of the selection (Ctrl+D) — no placement step. */
  duplicate(): boolean {
    if (!this.copy()) return false;
    return this.insertWithOffset(this.buildClones());
  }

  /** Builds fresh clone elements (fresh ids, labels kept, internal connections rewired). */
  private buildClones(): { shapes: Shape[]; connections: Element[] } {
    const clipboard = this.clipboard!;
    // Labels are kept verbatim, so the snapshot geometry stays correct for every note (an AUTO
    // box IS the label's text metrics, a MANUAL box was the user's choice). The fresh ids may
    // surface in the DSL as `(id …)` — allocate them DSL-style, reserving within the batch
    // (the clones only enter the registry once placed).
    const reserved = new Set<string>();
    const shapes = clipboard.shapes.map((snap) => {
      const id = this.esFactory.allocateId(
        snap.props['eventStormingType'] as EventStormingShapeType,
        reserved,
      );
      reserved.add(id);
      return this.elementFactory.createShape({
        ...structuredClone(snap.props),
        id,
        x: snap.x,
        y: snap.y,
        width: snap.width,
        height: snap.height,
        eventStormingLabel: snap.label,
      });
    });
    // Re-pin clones onto their clone hosts — the diagram-js bi-directional refs keep
    // `host.attachers` in sync, and AttachSupport moves/deletes them together after insert.
    clipboard.shapes.forEach((snap, i) => {
      if (snap.hostIdx !== undefined) shapes[i]!.host = shapes[snap.hostIdx]!;
    });
    const connections = clipboard.connections.map((c) =>
      this.elementFactory.createConnection({
        ...structuredClone(c.props),
        source: shapes[c.sourceIdx]!,
        target: shapes[c.targetIdx]!,
        waypoints: [center(shapes[c.sourceIdx]!), center(shapes[c.targetIdx]!)],
      }),
    );
    return { shapes, connections: connections as Element[] };
  }

  /** One `elements.create` command = one undo step; position = group center + offset. */
  private insertWithOffset(clones: { shapes: Shape[]; connections: Element[] }): boolean {
    this.pasteCount++;
    const offset = PASTE_OFFSET * this.pasteCount;
    const bbox = groupBBox(clones.shapes);
    const created = this.modeling.createElements(
      [...clones.shapes, ...clones.connections] as Element[],
      { x: bbox.cx + offset, y: bbox.cy + offset },
      this.canvas.getRootElement() as Shape,
    );
    this.selection.select(created as Element[]);
    return true;
  }
}

function center(s: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
} {
  return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
}

function groupBBox(shapes: Array<{ x: number; y: number; width: number; height: number }>): {
  cx: number;
  cy: number;
} {
  const minX = Math.min(...shapes.map((s) => s.x));
  const minY = Math.min(...shapes.map((s) => s.y));
  const maxX = Math.max(...shapes.map((s) => s.x + s.width));
  const maxY = Math.max(...shapes.map((s) => s.y + s.height));
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}
