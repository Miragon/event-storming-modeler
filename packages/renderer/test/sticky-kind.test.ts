import { describe, it, expect } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import CommandStack from 'diagram-js/lib/command/CommandStack';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type { Injector } from 'didi';
import EventStormingModeling from '../src/modeling/EventStormingModeling.js';
import { STICKY_STYLES } from '../src/draw/styles.js';
import type { EventStormingShape } from '../src/model/di-types.js';

// Real EventBus + CommandStack: the provisional confirmation must be ONE undoable command.
function harness() {
  const eventBus = new EventBus();
  const commandStack = new CommandStack(eventBus, {
    instantiate: (Type: new () => unknown) => new Type(),
  } as unknown as Injector);
  const modeling = new EventStormingModeling(
    commandStack,
    { getRootElement: () => ({ id: 'event-storming-root' }) } as unknown as Canvas,
    { get: () => undefined } as unknown as ElementRegistry,
  );
  return { modeling, commandStack };
}

function provisional(): EventStormingShape {
  const { width, height } = STICKY_STYLES.event;
  return {
    id: 'event_1',
    eventStormingType: 'event',
    eventStormingLabel: '',
    provisional: true,
    x: 400 - width / 2,
    y: 300 - height / 2,
    width,
    height,
  } as unknown as EventStormingShape;
}

describe('EventStormingModeling.setStickyKind: provisional (blank append) sticky', () => {
  it('confirms the chosen kind and clears `provisional` in ONE undoable command', () => {
    const { modeling, commandStack } = harness();
    const shape = provisional();

    modeling.setStickyKind(shape, 'policy');
    expect(shape.eventStormingType).toBe('policy');
    expect(shape.provisional).toBeUndefined();
    // Recentered to the new kind's box, exactly like a regular retype.
    expect(shape.width).toBe(STICKY_STYLES.policy.width);
    expect(shape.height).toBe(STICKY_STYLES.policy.height);
    expect(shape.x + shape.width / 2).toBe(400);
    expect(shape.y + shape.height / 2).toBe(300);

    // ONE undo step restores the blank provisional state entirely.
    commandStack.undo();
    expect(commandStack.canUndo()).toBe(false);
    expect(shape.provisional).toBe(true);
    expect(shape.eventStormingType).toBe('event');
    expect(shape.width).toBe(STICKY_STYLES.event.width);

    commandStack.redo();
    expect(shape.provisional).toBeUndefined();
    expect(shape.eventStormingType).toBe('policy');
  });

  // Picking the placeholder kind again IS a confirmation — the same-kind early-out must not
  // leave the sticky provisional.
  it('confirms even the placeholder kind itself (no same-kind no-op)', () => {
    const { modeling, commandStack } = harness();
    const shape = provisional();

    modeling.setStickyKind(shape, 'event');
    expect(shape.provisional).toBeUndefined();
    expect(shape.eventStormingType).toBe('event');
    expect(commandStack.canUndo()).toBe(true);
  });

  it('keeps the same-kind no-op for regular stickies', () => {
    const { modeling, commandStack } = harness();
    const shape = provisional();
    delete shape.provisional;
    modeling.setStickyKind(shape, 'event');
    expect(commandStack.canUndo()).toBe(false);
  });
});
