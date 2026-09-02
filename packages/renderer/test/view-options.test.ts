import { describe, it, expect } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import EventStormingViewOptions, {
  VIEW_OPTIONS_CHANGED_EVENT,
} from '../src/view-options/EventStormingViewOptions.js';

// Real EventBus so the toggle runs through the actual event machinery the apps and the
// change support listen on; the registry is a thin stub over a fixed element list.
function harness(elements: Array<Record<string, unknown>> = []) {
  const eventBus = new EventBus();
  const elementRegistry = {
    filter: (fn: (el: unknown) => boolean) => elements.filter(fn),
  } as unknown as ElementRegistry;
  const viewOptions = new EventStormingViewOptions(eventBus, elementRegistry);
  return { eventBus, viewOptions };
}

const sticky = { id: 'e1', eventStormingType: 'event', eventStormingLabel: 'Order Placed' };
const note = { id: 'n1', eventStormingType: 'note', eventStormingLabel: 'Risk' };
const drawing = { id: 'd1', eventStormingType: 'drawing', eventStormingLabel: '' };
const arrow = { id: 'a1', eventStormingType: 'arrow', waypoints: [] };

describe('EventStormingViewOptions: type captions', () => {
  it('shows type captions by default', () => {
    const { viewOptions } = harness();
    expect(viewOptions.typeCaptionsVisible()).toBe(true);
  });

  it('stores the flag and fires the pinned change event with the new value', () => {
    const { eventBus, viewOptions } = harness();
    const payloads: Array<{ typeCaptionsVisible: boolean }> = [];
    eventBus.on<{ typeCaptionsVisible: boolean }>(VIEW_OPTIONS_CHANGED_EVENT, (event) =>
      payloads.push({ typeCaptionsVisible: event.typeCaptionsVisible }),
    );

    viewOptions.setTypeCaptionsVisible(false);
    expect(viewOptions.typeCaptionsVisible()).toBe(false);
    expect(payloads).toEqual([{ typeCaptionsVisible: false }]);

    viewOptions.setTypeCaptionsVisible(true);
    expect(viewOptions.typeCaptionsVisible()).toBe(true);
    expect(payloads).toEqual([{ typeCaptionsVisible: false }, { typeCaptionsVisible: true }]);
  });

  it('re-renders exactly the sticky shapes via elements.changed (not notes/drawings/arrows)', () => {
    const { eventBus, viewOptions } = harness([sticky, note, drawing, arrow]);
    const changed: string[][] = [];
    eventBus.on<{ elements: Array<{ id: string }> }>('elements.changed', (event) =>
      changed.push(event.elements.map((el) => el.id)),
    );

    viewOptions.setTypeCaptionsVisible(false);
    expect(changed).toEqual([['e1']]);
  });

  it('treats setting the already-effective value as a no-op (no events)', () => {
    const { eventBus, viewOptions } = harness([sticky]);
    let fired = 0;
    eventBus.on(VIEW_OPTIONS_CHANGED_EVENT, () => fired++);
    eventBus.on('elements.changed', () => fired++);

    viewOptions.setTypeCaptionsVisible(true);
    expect(fired).toBe(0);
  });

  it('skips the re-render broadcast on an empty board but still announces the change', () => {
    const { eventBus, viewOptions } = harness([]);
    const fired: string[] = [];
    eventBus.on(VIEW_OPTIONS_CHANGED_EVENT, () => fired.push('viewOptions'));
    eventBus.on('elements.changed', () => fired.push('elements'));

    viewOptions.setTypeCaptionsVisible(false);
    expect(fired).toEqual(['viewOptions']);
  });
});
