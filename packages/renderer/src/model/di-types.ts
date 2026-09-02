import type { Shape, Connection } from 'diagram-js/lib/model/Types';
import {
  ATTACHABLE_STICKY_KINDS,
  HOST_STICKY_KINDS,
  type BoardEdge,
  type BoardElement,
  type DrawingStrokeStyle,
  type NoteAlignHorizontal,
  type NoteAlignVertical,
} from '@miragon/event-storming-schema-model';

/**
 * diagram-js runtime model with Event Storming extensions.
 *
 * The positional truth while editing is the diagram-js pixel geometry (`x`/`y`/`width`/`height`)
 * — there is no second coordinate system. `businessObject` is the identity/metadata backref to
 * the original model element; every editable field lives as a flat DI property.
 */

/** ID of the diagram-js root element of the Event Storming board. */
export const ROOT_ID = 'event-storming-root';

export type EventStormingShapeType =
  | 'event'
  | 'command'
  | 'actor'
  | 'aggregate'
  | 'policy'
  | 'readmodel'
  | 'external'
  | 'hotspot'
  | 'note'
  | 'drawing';

export type EventStormingConnectionType = 'arrow';

export interface EventStormingShape extends Shape {
  eventStormingType: EventStormingShapeType;
  /** Display text (separate from diagram-js `label`, which references a label element). */
  eventStormingLabel: string;
  /** drawing only: points in px RELATIVE to the shape's x/y (moving the shape moves them all). */
  drawingPoints?: Array<{ x: number; y: number }>;
  /** drawing only: closed polygon vs. open polyline. */
  closed?: boolean;
  /** drawing only. */
  strokeStyle?: DrawingStrokeStyle;
  /** Optional color override (CSS color/hex from the swatch palette) — any element type. */
  color?: string;
  /** note only: horizontal text alignment, mirrored from `NoteElement.align` — absent = 'left'. */
  alignHorizontal?: NoteAlignHorizontal;
  /** note only: vertical text-block anchoring, mirrored from `NoteElement.align` — absent = 'top'. */
  alignVertical?: NoteAlignVertical;
  /**
   * Blank append sticky awaiting its kind (chosen in the change-type popup after placing).
   * Renderer-only: never exported, never copied, never persisted — cleared by the retype.
   */
  provisional?: boolean;
  businessObject?: BoardElement;
}

export interface EventStormingConnection extends Connection {
  eventStormingType: EventStormingConnectionType;
  /** Arrow annotation text after `;` (e.g. "async"). */
  linkLabel?: string;
  businessObject?: BoardEdge;
}

function isObject(el: unknown): el is Record<string, unknown> {
  return typeof el === 'object' && el !== null;
}

/** Shapes and connections both carry `eventStormingType` — only connections have waypoints. */
export function isEventStormingShape(el: unknown): el is EventStormingShape {
  return isObject(el) && typeof el['eventStormingType'] === 'string' && !('waypoints' in el);
}

export function isEventStormingConnection(el: unknown): el is EventStormingConnection {
  return isObject(el) && typeof el['eventStormingType'] === 'string' && 'waypoints' in el;
}

/** The eight sticky kinds — connectable, retypeable, always fixed-size (not note/drawing). */
export const STICKY_KINDS = [
  'event',
  'command',
  'actor',
  'aggregate',
  'policy',
  'readmodel',
  'external',
  'hotspot',
] as const;

export type StickyKind = (typeof STICKY_KINDS)[number];

export function isStickyKind(type: string): type is StickyKind {
  return (STICKY_KINDS as readonly string[]).includes(type);
}

export function isSticky(el: unknown): el is EventStormingShape {
  return isEventStormingShape(el) && isStickyKind(el.eventStormingType);
}

/** Pinnable kinds (actor/hotspot/note): can be dropped onto a host sticky and then move with it. */
export function isAttachableKind(type: string): boolean {
  return (ATTACHABLE_STICKY_KINDS as readonly string[]).includes(type);
}

/** Host kinds: can carry pinned attachers. Disjoint from the attachable kinds — no chains. */
export function isHostKind(type: string): boolean {
  return (HOST_STICKY_KINDS as readonly string[]).includes(type);
}

export function isAttachableSticky(el: unknown): el is EventStormingShape {
  return isEventStormingShape(el) && isAttachableKind(el.eventStormingType);
}

export function isHostSticky(el: unknown): el is EventStormingShape {
  return isEventStormingShape(el) && isHostKind(el.eventStormingType);
}

export function isDrawing(el: unknown): el is EventStormingShape {
  return isEventStormingShape(el) && el.eventStormingType === 'drawing';
}

export function isNote(el: unknown): el is EventStormingShape {
  return isEventStormingShape(el) && el.eventStormingType === 'note';
}
