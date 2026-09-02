import type {
  BoardElement,
  ElementType,
  EventStormingBoard,
} from '@miragon/event-storming-schema-model';
import { updateElement, compact } from './util.js';

/** The eight retypeable sticky kinds — every element kind except notes and drawings. */
export const STICKY_ELEMENT_TYPES = [
  'event',
  'command',
  'actor',
  'aggregate',
  'policy',
  'readmodel',
  'external',
  'hotspot',
] as const;

export type StickyElementType = (typeof STICKY_ELEMENT_TYPES)[number];

export function isStickyElementType(elementType: ElementType): elementType is StickyElementType {
  return (STICKY_ELEMENT_TYPES as readonly ElementType[]).includes(elementType);
}

/**
 * Retypes a sticky (e.g. command → event), preserving id, label, position and color.
 * Notes and drawings are not stickies and cannot take part in retyping.
 */
export function setStickyKind(
  board: EventStormingBoard,
  elementId: string,
  elementType: StickyElementType,
): EventStormingBoard {
  if (!isStickyElementType(elementType)) {
    throw new Error(
      `setStickyKind cannot retype to "${elementType as string}"; not a sticky kind.`,
    );
  }
  return updateElement(board, elementId, (el) => {
    if (!isStickyElementType(el.elementType)) {
      throw new Error(
        `setStickyKind only applies to stickies; "${elementId}" is ${el.elementType}.`,
      );
    }
    // Rebuild from the shared base fields so nothing kind-specific ever leaks across a retype.
    return compact({
      id: el.id,
      elementType,
      label: el.label,
      position: el.position,
      color: el.color,
    }) as BoardElement;
  });
}
