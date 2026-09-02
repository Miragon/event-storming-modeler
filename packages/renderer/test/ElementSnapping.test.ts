import { describe, it, expect } from 'vitest';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import ElementSnapping from '../src/snapping/ElementSnapping.js';

interface DragEvent {
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  originalEvent?: { shiftKey?: boolean };
  context?: Record<string, unknown>;
}

/** Sticky at center (200, 300). */
const ANCHOR_STICKY = {
  id: 'event_anchor',
  eventStormingType: 'event',
  eventStormingLabel: 'Order Placed',
  x: 135,
  y: 255,
  width: 130,
  height: 90,
};

function setup(elements: Array<Record<string, unknown>> = [ANCHOR_STICKY]) {
  const handlers = new Map<string, (event: DragEvent) => void>();
  const eventBus = {
    on: (events: string | string[], _priority: number, cb: (event: DragEvent) => void) => {
      for (const e of Array.isArray(events) ? events : [events]) handlers.set(e, cb);
    },
  } as unknown as EventBus;
  const registry = { getAll: () => elements } as unknown as ElementRegistry;
  new ElementSnapping(eventBus, registry);
  return { fire: (event: string, e: DragEvent) => handlers.get(event)!(e) };
}

/** The moving shape: center at (x + 65, y + 45) before the delta. */
function moveEvent(overrides: Partial<DragEvent> = {}): DragEvent {
  return {
    x: 400,
    y: 400,
    dx: 0,
    dy: 0,
    context: {
      shape: { id: 'cmd_moving', x: 129, y: 250, width: 130, height: 90 },
      shapes: [{ id: 'cmd_moving' }],
    },
    ...overrides,
  };
}

describe('ElementSnapping: move', () => {
  it('snaps the moved shape center to a nearby sticky center on both axes (x+dx together)', () => {
    const { fire } = setup();
    // Moving center = (194, 295) — within 8px of the anchor center (200, 300).
    const event = moveEvent();
    fire('shape.move.move', event);
    expect(event.dx).toBe(6);
    expect(event.x).toBe(406);
    expect(event.dy).toBe(5);
    expect(event.y).toBe(405);
  });

  it('does not snap outside the tolerance', () => {
    const { fire } = setup();
    const event = moveEvent({
      context: {
        shape: { id: 'cmd_moving', x: 0, y: 0, width: 130, height: 90 },
        shapes: [{ id: 'cmd_moving' }],
      },
    });
    fire('shape.move.move', event);
    expect(event.dx).toBe(0);
    expect(event.dy).toBe(0);
  });

  it('is disabled while Shift is held', () => {
    const { fire } = setup();
    const event = moveEvent({ originalEvent: { shiftKey: true } });
    fire('shape.move.move', event);
    expect(event.dx).toBe(0);
    expect(event.dy).toBe(0);
  });

  it('never snaps to the shapes being moved themselves', () => {
    const { fire } = setup([
      { ...ANCHOR_STICKY, id: 'cmd_moving' }, // the mover is the only registry entry
    ]);
    const event = moveEvent();
    fire('shape.move.move', event);
    expect(event.dx).toBe(0);
    expect(event.dy).toBe(0);
  });

  it('ignores drawings as snap targets', () => {
    const { fire } = setup([{ ...ANCHOR_STICKY, id: 'draw_box', eventStormingType: 'drawing' }]);
    const event = moveEvent();
    fire('shape.move.move', event);
    expect(event.dx).toBe(0);
    expect(event.dy).toBe(0);
  });
});

describe('ElementSnapping: create', () => {
  it('snaps the create cursor (= shape midpoint) to nearby sticky centers', () => {
    const { fire } = setup();
    const event: DragEvent = { x: 205, y: 306, dx: 100, dy: 100, context: {} };
    fire('create.move', event);
    expect(event.x).toBe(200);
    expect(event.dx).toBe(95);
    expect(event.y).toBe(300);
    expect(event.dy).toBe(94);
  });

  it('is disabled while Shift is held', () => {
    const { fire } = setup();
    const event: DragEvent = {
      x: 205,
      y: 306,
      dx: 0,
      dy: 0,
      originalEvent: { shiftKey: true },
      context: {},
    };
    fire('create.move', event);
    expect(event.x).toBe(205);
    expect(event.y).toBe(306);
  });
});
