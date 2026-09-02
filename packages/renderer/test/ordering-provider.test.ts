import { describe, it, expect } from 'vitest';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ElementLike, ShapeLike } from 'diagram-js/lib/model/Types';
import EventStormingOrderingProvider from '../src/ordering/EventStormingOrderingProvider.js';

function provider(): EventStormingOrderingProvider {
  return new EventStormingOrderingProvider({ on: () => {} } as unknown as EventBus);
}

function root(children: ElementLike[] = []): ShapeLike {
  return { id: 'event-storming-root', children } as unknown as ShapeLike;
}

function sticky(id: string, parent: ShapeLike): ShapeLike {
  return { id, eventStormingType: 'event', parent } as unknown as ShapeLike;
}

describe('EventStormingOrderingProvider: flat board', () => {
  // Regression: dropping a palette create (or moving a sticky) with the cursor over an existing
  // sticky nested the element under it — deleting/moving the bottom sticky silently cascaded.
  it('retargets a sticky dropped onto another sticky to the root', () => {
    const boardRoot = root();
    const hoveredSticky = sticky('event_order_placed', boardRoot);
    const created = { id: 'cmd_new', eventStormingType: 'command' } as unknown as ElementLike;

    const ordering = provider().getOrdering(created, hoveredSticky);
    expect(ordering.parent).toBe(boardRoot);
  });

  it('computes the connection band index against the root children, not the hovered shape', () => {
    const drawing = { id: 'draw_1', eventStormingType: 'drawing' } as unknown as ElementLike;
    const existingArrow = {
      id: 'arrow_1',
      eventStormingType: 'arrow',
      waypoints: [],
    } as unknown as ElementLike;
    const boardRoot = root([drawing, existingArrow]);
    const hoveredSticky = sticky('event_order_placed', boardRoot);
    const newArrow = {
      id: 'arrow_2',
      eventStormingType: 'arrow',
      waypoints: [],
    } as unknown as ElementLike;

    const ordering = provider().getOrdering(newArrow, hoveredSticky);
    expect(ordering.parent).toBe(boardRoot);
    expect(ordering.index).toBe(2);
  });

  it('keeps a root drop target unchanged', () => {
    const boardRoot = root();
    const created = { id: 'note_new', eventStormingType: 'note' } as unknown as ElementLike;

    const ordering = provider().getOrdering(created, boardRoot);
    expect(ordering.parent).toBe(boardRoot);
    expect(ordering.index).toBeUndefined();
  });
});
