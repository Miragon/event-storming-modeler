import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Root } from 'diagram-js/lib/model/Types';
import type { BoardElement, EventStormingBoard } from '@miragon/event-storming-schema-model';
import type BoardBounds from '../board-bounds/BoardBounds.js';
import type EventStormingElementFactory from '../model/EventStormingElementFactory.js';
import type { EventStormingShape } from '../model/di-types.js';
import { ROOT_ID, type ImportWarning, type RootBusinessObject } from './types.js';

/**
 * Z-order of the shapes among themselves: smaller number = further back. Drawings encircle
 * sticky clusters and must never swallow their clicks, so they sit at the very back; the
 * connections are inserted between drawings and stickies via parentIndex.
 */
const TYPE_ORDER: Record<string, number> = {
  drawing: 0,
  note: 1,
};

/**
 * Bridges the EventStormingBoard model into the diagram-js canvas. Deliberately bypasses the
 * commandStack (import path): no undo, no dirty.
 */
export default class EventStormingImporter {
  static $inject = [
    'canvas',
    'elementFactory',
    'eventStormingElementFactory',
    'boardBounds',
    'eventBus',
    'elementRegistry',
  ];

  constructor(
    private readonly canvas: Canvas,
    private readonly elementFactory: ElementFactory,
    private readonly factory: EventStormingElementFactory,
    private readonly boardBounds: BoardBounds,
    private readonly eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
  ) {}

  import(board: EventStormingBoard): ImportWarning[] {
    const warnings: ImportWarning[] = [];
    this.eventBus.fire('import.render.start', { board });

    const meta: RootBusinessObject = {
      config: board.config,
      ...(board.rawPassthrough ? { rawPassthrough: board.rawPassthrough } : {}),
    };

    // Reuse the existing root (re-import), otherwise create a new one.
    let existing: (Root & { businessObject?: RootBusinessObject }) | undefined;
    try {
      existing = this.canvas.getRootElement() as Root & { businessObject?: RootBusinessObject };
    } catch {
      existing = undefined;
    }
    let root: Root & { businessObject?: RootBusinessObject };
    if (existing && existing.id === ROOT_ID) {
      root = existing;
    } else {
      root = this.elementFactory.createRoot({ id: ROOT_ID }) as Root & {
        businessObject?: RootBusinessObject;
      };
      this.canvas.setRootElement(root);
    }
    root.businessObject = meta;

    const shapeById = new Map<string, EventStormingShape>();
    const ordered = [...board.elements].sort(
      (a, b) => (TYPE_ORDER[a.elementType] ?? 9) - (TYPE_ORDER[b.elementType] ?? 9),
    );

    // Z-order (back -> front): drawings -> connections -> stickies/notes. Drawings and nodes
    // must be registered before the connections; the connections are then inserted via
    // parentIndex BEHIND the nodes (but after the drawings).
    const drawings = ordered.filter((el) => el.elementType === 'drawing');
    const nodes = ordered.filter((el) => el.elementType !== 'drawing');

    for (const el of drawings) {
      const shape = this.createShape(el);
      this.canvas.addShape(shape, root);
      shapeById.set(el.id, shape);
    }
    for (const el of nodes) {
      const shape = this.createShape(el);
      this.canvas.addShape(shape, root);
      shapeById.set(el.id, shape);
    }

    for (const edge of board.edges) {
      const source = shapeById.get(edge.from);
      const target = shapeById.get(edge.to);
      if (!source || !target) {
        warnings.push({ message: `Edge ${edge.id}: endpoint missing.`, elementId: edge.id });
        continue;
      }
      const conn = this.factory.createArrow(edge, source, target);
      // Insert directly behind the drawings, before all nodes.
      this.canvas.addConnection(conn, root, drawings.length);
    }

    this.canvas.viewbox(this.boardBounds.contentBounds());
    this.eventBus.fire('import.render.done', { warnings });
    return warnings;
  }

  private createShape(el: BoardElement): EventStormingShape {
    switch (el.elementType) {
      case 'note':
        return this.factory.createNote(el);
      case 'drawing':
        return this.factory.createDrawing(el);
      default:
        return this.factory.createSticky(el);
    }
  }

  clear(): void {
    for (const el of [...this.elementRegistry.getAll()]) {
      const e = el as { waypoints?: unknown; id: string };
      if (e.id === ROOT_ID) continue;
      try {
        if (e.waypoints) this.canvas.removeConnection(e.id);
        else this.canvas.removeShape(e.id);
      } catch {
        // already removed (e.g. edge on a removed shape) — ignore
      }
    }
  }
}
