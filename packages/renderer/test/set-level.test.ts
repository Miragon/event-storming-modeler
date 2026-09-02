import { describe, it, expect } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import CommandStack from 'diagram-js/lib/command/CommandStack';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type { Injector } from 'didi';
import type { BoardConfig } from '@miragon/event-storming-schema-model';
import EventStormingModeling from '../src/modeling/EventStormingModeling.js';
import EventStormingExporter from '../src/io/EventStormingExporter.js';
import { ROOT_ID } from '../src/io/types.js';

// Real EventBus + CommandStack so setLevel runs through the actual undo/redo machinery and the
// real exporter proves the level lands in (and leaves) the serialized board config.
function harness(config: BoardConfig | null = { title: 'Fixture' }) {
  const root = { id: ROOT_ID, ...(config ? { businessObject: { config } } : {}) };
  const canvas = { getRootElement: () => root } as unknown as Canvas;
  const registry = { get: (id: string) => (id === ROOT_ID ? root : undefined) };
  const eventBus = new EventBus();
  const commandStack = new CommandStack(eventBus, {
    instantiate: (Type: new () => unknown) => new Type(),
  } as unknown as Injector);
  const modeling = new EventStormingModeling(
    commandStack,
    canvas,
    registry as unknown as ElementRegistry,
  );
  const exporter = new EventStormingExporter(
    { getAll: () => [] } as unknown as ElementRegistry,
    canvas,
  );
  return { modeling, exporter, commandStack, eventBus };
}

describe('EventStormingModeling: setLevel/getLevel', () => {
  it('defaults to design and round-trips setLevel through export, undo and redo', () => {
    const { modeling, exporter, commandStack } = harness();
    expect(modeling.getLevel()).toBe('design');

    modeling.setLevel('big-picture');
    expect(modeling.getLevel()).toBe('big-picture');
    expect(exporter.export().config.level).toBe('big-picture');

    commandStack.undo();
    expect(modeling.getLevel()).toBe('design');
    expect(exporter.export().config.level).toBeUndefined();

    commandStack.redo();
    expect(modeling.getLevel()).toBe('big-picture');
    expect(exporter.export().config.level).toBe('big-picture');
  });

  it('keeps title and style when changing the level', () => {
    const { modeling, exporter } = harness({ title: 'Checkout', style: 'dark' });
    modeling.setLevel('process');
    expect(exporter.export().config).toEqual({
      title: 'Checkout',
      style: 'dark',
      level: 'process',
    });
  });

  it('fires commandStack.changed on setLevel and its undo (the apps persist on it)', () => {
    const { modeling, commandStack, eventBus } = harness();
    let changed = 0;
    eventBus.on('commandStack.changed', () => changed++);
    modeling.setLevel('process');
    expect(changed).toBe(1);
    commandStack.undo();
    expect(changed).toBe(2);
  });

  it('treats setLevel to the already-effective level as a no-op (no undo step)', () => {
    const { modeling, commandStack, exporter } = harness();
    modeling.setLevel('design');
    expect(commandStack.canUndo()).toBe(false);
    // The config stays minimal: absent level already means design.
    expect(exporter.export().config.level).toBeUndefined();
  });

  it('creates the root config on a board that has none yet', () => {
    const { modeling, exporter } = harness(null);
    modeling.setLevel('big-picture');
    expect(modeling.getLevel()).toBe('big-picture');
    expect(exporter.export().config).toEqual({ title: 'Untitled Board', level: 'big-picture' });
  });

  // Regression: the palette asks for the level at BOOTSTRAP, before any board is imported.
  // canvas.getRootElement() would CREATE an implicit root as a side effect; that stale root later
  // crashed the importer's root swap ("Cannot set properties of undefined (setting 'secondaryGfx')").
  it('getLevel before any import defaults to design without touching the canvas root', () => {
    const canvas = {
      getRootElement: () => {
        throw new Error('getLevel must not create an implicit root');
      },
    } as unknown as Canvas;
    const eventBus = new EventBus();
    const commandStack = new CommandStack(eventBus, {
      instantiate: (Type: new () => unknown) => new Type(),
    } as unknown as Injector);
    const modeling = new EventStormingModeling(commandStack, canvas, {
      get: () => undefined,
    } as unknown as ElementRegistry);
    expect(modeling.getLevel()).toBe('design');
  });
});
