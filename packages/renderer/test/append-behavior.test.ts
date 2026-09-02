import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import type { Injector } from 'didi';
import EventStormingAppendBehavior from '../src/append/EventStormingAppendBehavior.js';
import { POPUP_PROVIDER_ID } from '../src/popup/index.js';

/**
 * The post-placement chain (popup -> retype -> label edit / dismiss -> remove) runs on real
 * EventBus events with the collaborating services mocked; the popup INTERACTION itself is
 * covered by the browser integration test.
 */
function harness() {
  const eventBus = new EventBus();
  let popupOpen = false;
  const popupMenu = {
    open: vi.fn(() => {
      popupOpen = true;
    }),
    isOpen: () => popupOpen,
  };
  const modeling = { removeElements: vi.fn() };
  const labelEditing = { activate: vi.fn() };
  const canvas = {
    getAbsoluteBBox: () => ({ x: 10, y: 20, width: 130, height: 90 }),
    getContainer: () => ({ getBoundingClientRect: () => ({ left: 100, top: 50 }) }),
  };
  const services: Record<string, unknown> = {
    popupMenu,
    modeling,
    canvas,
    eventStormingLabelEditing: labelEditing,
  };
  const injector = { get: (name: string) => services[name] ?? null } as unknown as Injector;
  new EventStormingAppendBehavior(injector, eventBus);
  const closePopup = () => {
    popupOpen = false;
    eventBus.fire('popupMenu.close');
  };
  return { eventBus, popupMenu, modeling, labelEditing, closePopup };
}

function provisionalShape() {
  return {
    id: 'event_1',
    eventStormingType: 'event',
    eventStormingLabel: '',
    provisional: true,
    parent: { id: 'event-storming-root' },
  } as Record<string, unknown>;
}

function fireCreateEnd(eventBus: EventBus, shape: Record<string, unknown>) {
  eventBus.fire('create.end', {
    context: { source: { x: 0, y: 0, width: 130, height: 90 }, shape, canExecute: {} },
  });
}

describe('EventStormingAppendBehavior: post-placement chain', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens the change-type popup on the landed provisional sticky, not the label editor', () => {
    const { eventBus, popupMenu, labelEditing } = harness();
    const shape = provisionalShape();
    fireCreateEnd(eventBus, shape);
    vi.runAllTimers();
    // Anchored right below the sticky in CLIENT coordinates (canvas offset + absolute bbox).
    expect(popupMenu.open).toHaveBeenCalledWith(shape, POPUP_PROVIDER_ID, {
      x: 100 + 10,
      y: 50 + 20 + 90 + 6,
    });
    expect(labelEditing.activate).not.toHaveBeenCalled();
  });

  it('keeps the direct label edit for non-provisional appends', () => {
    const { eventBus, popupMenu, labelEditing } = harness();
    const shape = { ...provisionalShape(), provisional: undefined };
    fireCreateEnd(eventBus, shape);
    vi.runAllTimers();
    expect(popupMenu.open).not.toHaveBeenCalled();
    expect(labelEditing.activate).toHaveBeenCalledWith(shape);
  });

  it('ignores plain palette creates (no source)', () => {
    const { eventBus, popupMenu, labelEditing } = harness();
    eventBus.fire('create.end', { context: { shape: provisionalShape(), canExecute: {} } });
    vi.runAllTimers();
    expect(popupMenu.open).not.toHaveBeenCalled();
    expect(labelEditing.activate).not.toHaveBeenCalled();
  });

  // Choosing runs the retype action BEFORE the popup closes (the command auto-closes it), so a
  // cleared `provisional` on close means: hand over to the label editor (step 2 of the chain).
  it('opens the label editor after a kind was chosen', () => {
    const { eventBus, modeling, labelEditing, closePopup } = harness();
    const shape = provisionalShape();
    fireCreateEnd(eventBus, shape);
    vi.runAllTimers();
    delete shape['provisional']; // what the setStickyKind confirmation does
    closePopup();
    vi.runAllTimers();
    expect(labelEditing.activate).toHaveBeenCalledWith(shape);
    expect(modeling.removeElements).not.toHaveBeenCalled();
  });

  it('removes the still-provisional sticky when the popup is dismissed', () => {
    const { eventBus, modeling, labelEditing, closePopup } = harness();
    const shape = provisionalShape();
    fireCreateEnd(eventBus, shape);
    vi.runAllTimers();
    closePopup();
    vi.runAllTimers();
    expect(modeling.removeElements).toHaveBeenCalledWith([shape]);
    expect(labelEditing.activate).not.toHaveBeenCalled();
  });

  it('does not double-remove a sticky that already left the canvas (undo of the create)', () => {
    const { eventBus, modeling, closePopup } = harness();
    const shape = provisionalShape();
    fireCreateEnd(eventBus, shape);
    vi.runAllTimers();
    shape['parent'] = null; // undo removed it from the canvas
    closePopup();
    vi.runAllTimers();
    expect(modeling.removeElements).not.toHaveBeenCalled();
  });

  it('reacts to the NEXT popup close only once (no stale handler on later popups)', () => {
    const { eventBus, modeling, closePopup } = harness();
    const shape = provisionalShape();
    fireCreateEnd(eventBus, shape);
    vi.runAllTimers();
    closePopup();
    vi.runAllTimers();
    expect(modeling.removeElements).toHaveBeenCalledTimes(1);
    // A later, unrelated popup close must not touch the (long gone) shape again.
    eventBus.fire('popupMenu.close');
    vi.runAllTimers();
    expect(modeling.removeElements).toHaveBeenCalledTimes(1);
  });

  it('becomes a no-op after diagram.destroy (no commands on a destroyed diagram)', () => {
    const { eventBus, modeling, closePopup } = harness();
    const shape = provisionalShape();
    fireCreateEnd(eventBus, shape);
    vi.runAllTimers();
    popupCloseThenDestroy(eventBus, closePopup);
    vi.runAllTimers();
    expect(modeling.removeElements).not.toHaveBeenCalled();
  });
});

/** Close fires first (diagram teardown closes the popup), destroy lands before the deferred step. */
function popupCloseThenDestroy(eventBus: EventBus, closePopup: () => void) {
  closePopup();
  eventBus.fire('diagram.destroy');
}
