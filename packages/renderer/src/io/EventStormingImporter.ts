import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Root } from 'diagram-js/lib/model/Types';
import type { BoardElement, EventStormingBoard } from '@miragon/event-storming-schema-model';
import type BoardBounds from '../board-bounds/BoardBounds.js';
import type EventStormingElementFactory from '../model/EventStormingElementFactory.js';
import { isHostSticky, type EventStormingShape } from '../model/di-types.js';
import { ROOT_ID, type ImportWarning, type RootBusinessObject } from './types.js';

/**
 * Z-order of the shapes among themselves: smaller number = further back. Drawings encircle
 * sticky clusters and must never swallow their clicks, so they sit at the very back; the
 * connections are inserted between drawings and stickies via parentIndex. Stickies and notes
 * share the top band in document order — the interactive ordering provider appends both, so a
 * separate note band would make the stacking flip between a session and the re-imported board.
 */
const TYPE_ORDER: Record<string, number> = {
  drawing: 0,
};

/**
 * diagram-js reads its zoom back rounded to three decimals: a fit below 0.0005 would read back as
 * zoom 0 and a NaN viewbox. A board wider than about 2000 viewports shows its centre at this zoom.
 */
const SMALLEST_FIT_ZOOM = 0.001;

type BoardRoot = Root & { businessObject?: RootBusinessObject };

export interface EventStormingImporterConfig {
  /** Fit the board into the view after every import (default true). */
  fitOnImport?: boolean | undefined;
}

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
    'config.eventStormingImporter',
  ];

  constructor(
    private readonly canvas: Canvas,
    private readonly elementFactory: ElementFactory,
    private readonly factory: EventStormingElementFactory,
    private readonly boardBounds: BoardBounds,
    private readonly eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
    private readonly config?: EventStormingImporterConfig,
  ) {}

  import(board: EventStormingBoard): ImportWarning[] {
    const warnings: ImportWarning[] = [];
    this.eventBus.fire('import.render.start', { board });

    const meta: RootBusinessObject = {
      config: board.config,
      ...(board.rawPassthrough ? { rawPassthrough: board.rawPassthrough } : {}),
    };

    const root = this.boardRoot();
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

    // Pinning is wired only once ALL shapes exist — a host may appear later in document order
    // than its attacher. The diagram-js bi-directional refs keep `host.attachers` in sync;
    // positions stay the elements' own absolute centers (attachedTo adds behavior, not geometry).
    for (const el of nodes) {
      const attachedTo = 'attachedTo' in el ? el.attachedTo : undefined;
      if (!attachedTo) continue;
      const host = shapeById.get(attachedTo);
      if (!host || !isHostSticky(host)) {
        warnings.push({
          message: `“${el.id}” is pinned to “${attachedTo}”, which isn't on the board or can't hold a pin. It stays unpinned.`,
          elementId: el.id,
        });
        continue;
      }
      shapeById.get(el.id)!.host = host;
    }

    for (const edge of board.edges) {
      const source = shapeById.get(edge.from);
      const target = shapeById.get(edge.to);
      if (!source || !target) {
        warnings.push({
          message: `The arrow “${edge.id}” has an end that isn't on the board, so it was left out.`,
          elementId: edge.id,
        });
        continue;
      }
      const conn = this.factory.createArrow(edge, source, target);
      // Insert directly behind the drawings, before all nodes.
      this.canvas.addConnection(conn, root, drawings.length);
    }

    if (this.config?.fitOnImport !== false) this.fitToContent();
    this.eventBus.fire('import.render.done', { warnings });
    return warnings;
  }

  /**
   * The board root, created on the first import. Any other root goes: diagram-js creates an
   * implicit one whenever something asks for the root before the first import (an export, a
   * palette create), and it would stay in the registry under an id the next board could reuse.
   */
  private boardRoot(): BoardRoot {
    let root = this.elementRegistry.get(ROOT_ID) as BoardRoot | undefined;
    if (!root) {
      root = this.elementFactory.createRoot({ id: ROOT_ID }) as BoardRoot;
      this.canvas.setRootElement(root);
    }
    for (const other of this.canvas.getRootElements()) {
      if (other !== root) this.canvas.removeRootElement(other);
    }
    return root;
  }

  /**
   * Centres the content at the largest zoom that shows all of it, never above 100% (guide §5.9);
   * an empty board, with nothing to fit, shows the centre of its default frame at 100%. Hosts with
   * their own fit insets refit after.
   */
  private fitToContent(): void {
    const bounds = this.boardBounds.contentBounds();
    const { width, height } = this.canvas.getSize();
    if (!(width > 0 && height > 0)) {
      this.canvas.viewbox(bounds);
      return;
    }
    const scale = this.boardBounds.isEmpty()
      ? 1
      : Math.max(Math.min(width / bounds.width, height / bounds.height, 1), SMALLEST_FIT_ZOOM);
    this.canvas.viewbox({
      x: bounds.x + bounds.width / 2 - width / 2 / scale,
      y: bounds.y + bounds.height / 2 - height / 2 / scale,
      width: width / scale,
      height: height / scale,
    });
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

  /** Removes every element but the roots (removing a root as a shape corrupts the canvas). */
  clear(): void {
    const roots = new Set<unknown>(this.canvas.getRootElements());
    for (const el of [...this.elementRegistry.getAll()]) {
      if (roots.has(el)) continue;
      const e = el as { waypoints?: unknown; id: string };
      try {
        if (e.waypoints) this.canvas.removeConnection(e.id);
        else this.canvas.removeShape(e.id);
      } catch {
        // already removed (e.g. edge on a removed shape) — ignore
      }
    }
  }
}
