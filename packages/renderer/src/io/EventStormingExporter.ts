import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type { Root } from 'diagram-js/lib/model/Types';
import {
  validateBoard,
  CURRENT_SCHEMA_VERSION,
  type BoardConfig,
  type BoardEdge,
  type BoardElement,
  type EventStormingBoard,
  type NoteAlign,
} from '@miragon/event-storming-schema-model';
import {
  isEventStormingConnection,
  isEventStormingShape,
  type EventStormingShape,
} from '../model/di-types.js';
import { isManualNoteBox } from '../draw/styles.js';
import { ROOT_ID, type RootBusinessObject } from './types.js';

/**
 * Reconstructs an EventStormingBoard from the diagram-js runtime model. The DI properties are
 * the single source of truth — position is the shape CENTER back-calculated from the pixel
 * geometry; the `businessObject` only serves as identity backref and is not consulted for data.
 */
export default class EventStormingExporter {
  static $inject = ['elementRegistry', 'canvas'];

  constructor(
    private readonly elementRegistry: ElementRegistry,
    private readonly canvas: Canvas,
  ) {}

  export(): EventStormingBoard {
    const root = this.canvas.getRootElement() as Root & { businessObject?: RootBusinessObject };
    const meta = root.businessObject;
    const config: BoardConfig = meta?.config ?? { title: 'Untitled Board' };

    const elements: BoardElement[] = [];
    const edges: BoardEdge[] = [];

    for (const el of this.elementRegistry.getAll()) {
      if (el.id === ROOT_ID) continue;
      if (isEventStormingConnection(el)) {
        edges.push({
          id: el.id,
          edgeType: 'arrow',
          from: el.source?.id ?? '',
          to: el.target?.id ?? '',
          ...(el.linkLabel ? { label: el.linkLabel } : {}),
        });
      } else if (isEventStormingShape(el)) {
        const built = this.buildElement(el);
        if (built) elements.push(built);
      }
    }

    const board: EventStormingBoard = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      config,
      elements,
      edges,
      ...(meta?.rawPassthrough ? { rawPassthrough: meta.rawPassthrough } : {}),
    };

    return validateBoard(board);
  }

  /** Builds a BoardElement from the DI properties; position = shape center. */
  private buildElement(el: EventStormingShape): BoardElement | undefined {
    if (el.eventStormingType === 'drawing') {
      // Points are stored relative to the shape in px — convert back to absolute board px.
      const points = (el.drawingPoints ?? []).map((p) => ({ x: el.x + p.x, y: el.y + p.y }));
      if (points.length < 2) return undefined;
      return {
        id: el.id,
        elementType: 'drawing',
        label: '',
        position: points[0]!,
        points,
        ...(el.closed ? { closed: true } : {}),
        ...(el.strokeStyle ? { strokeStyle: el.strokeStyle } : {}),
        ...(el.color ? { color: el.color } : {}),
      };
    }
    // Auto-vs-manual: `size` is emitted ONLY when the note box differs from its text metrics —
    // auto-sized notes stay absent-size, keeping existing boards byte-identical on round-trip.
    const manualSize =
      el.eventStormingType === 'note' && isManualNoteBox(el.eventStormingLabel, el)
        ? { width: el.width, height: el.height }
        : undefined;
    const align = el.eventStormingType === 'note' ? noteAlignOf(el) : undefined;
    return {
      id: el.id,
      elementType: el.eventStormingType,
      label: el.eventStormingLabel,
      position: { x: el.x + el.width / 2, y: el.y + el.height / 2 },
      ...(el.color ? { color: el.color } : {}),
      ...(manualSize ? { size: manualSize } : {}),
      ...(align ? { align } : {}),
      // Pinning lives in the diagram-js host/attachers refs — only actor/hotspot/note ever
      // carry a host (attach rule), matching the schema's attachedTo placement.
      ...(el.host ? { attachedTo: el.host.id } : {}),
    };
  }
}

/**
 * Canonical model alignment from the DI props: default axes (left/top) collapse to absent —
 * even when a caller wrote them explicitly — so unaligned boards keep serializing
 * byte-identically (the DSL emits `(align …)` only when this returns a value).
 */
function noteAlignOf(el: EventStormingShape): NoteAlign | undefined {
  const horizontal =
    el.alignHorizontal && el.alignHorizontal !== 'left' ? el.alignHorizontal : undefined;
  const vertical = el.alignVertical && el.alignVertical !== 'top' ? el.alignVertical : undefined;
  if (!horizontal && !vertical) return undefined;
  return { ...(horizontal ? { horizontal } : {}), ...(vertical ? { vertical } : {}) };
}
