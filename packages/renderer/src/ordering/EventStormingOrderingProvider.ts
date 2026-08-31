import OrderingProvider from 'diagram-js/lib/features/ordering/OrderingProvider';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ElementLike, ShapeLike } from 'diagram-js/lib/model/Types';
import { isDrawing, isEventStormingConnection } from '../model/di-types.js';

/**
 * Keeps the z-order stable for INTERACTIVELY created/moved elements, matching the import order:
 * drawings at the back, connections in the middle, stickies/notes on top. Without this,
 * connections drawn in the editor would land above the stickies (unlike imported ones).
 */
export default class EventStormingOrderingProvider extends OrderingProvider {
  static override $inject = ['eventBus'];

  constructor(eventBus: EventBus) {
    super(eventBus);
  }

  override getOrdering(
    element: ElementLike,
    newParent: ShapeLike,
  ): { parent: ShapeLike; index?: number } {
    const siblings = (newParent.children ?? []) as ElementLike[];
    if (isEventStormingConnection(element)) {
      // Behind the stickies: after all drawings and existing connections.
      const index = siblings.filter(
        (c) => c !== element && (isDrawing(c) || isEventStormingConnection(c)),
      ).length;
      return { parent: newParent, index };
    }
    if (isDrawing(element)) {
      // All the way to the back (after the other drawings).
      const index = siblings.filter((c) => c !== element && isDrawing(c)).length;
      return { parent: newParent, index };
    }
    // Stickies/notes: on top (append).
    return { parent: newParent };
  }
}
