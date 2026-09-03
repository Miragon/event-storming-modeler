import { describe, it, expect, vi } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import type { BoardLevel } from '@miragon/event-storming-schema-model';
import EventStormingPaletteProvider from '../src/palette/EventStormingPaletteProvider.js';
import { ROOT_ID } from '../src/model/di-types.js';

function providerHarness(level: BoardLevel = 'design') {
  const eventBus = new EventBus();
  const rebuild = vi.fn();
  const provider = new EventStormingPaletteProvider(
    { registerProvider: vi.fn(), _rebuild: rebuild } as never,
    { start: vi.fn() } as never,
    { createNew: vi.fn() } as never,
    { activateSelection: vi.fn() } as never,
    { toggle: vi.fn() } as never,
    { getLevel: () => level } as never,
    eventBus,
  );
  return { provider, eventBus, rebuild };
}

describe('EventStormingPaletteProvider: level filtering', () => {
  // Levels filter the creation surfaces only; note and the tools are annotations/infrastructure
  // and must survive every level.
  it('offers per workshop level exactly the allowed sticky kinds, keeping note and the tools', () => {
    const expected: Record<BoardLevel, string[]> = {
      'big-picture': ['create.event', 'create.actor', 'create.external', 'create.hotspot'],
      process: [
        'create.event',
        'create.command',
        'create.actor',
        'create.policy',
        'create.readmodel',
        'create.external',
        'create.hotspot',
      ],
      design: [
        'create.event',
        'create.command',
        'create.actor',
        'create.aggregate',
        'create.policy',
        'create.readmodel',
        'create.external',
        'create.hotspot',
      ],
    };
    for (const [level, stickies] of Object.entries(expected)) {
      const { provider } = providerHarness(level as BoardLevel);
      const keys = Object.keys(provider.getPaletteEntries());
      expect(keys.filter((key) => key.startsWith('create.') && key !== 'create.note')).toEqual(
        stickies,
      );
      expect(keys).toContain('create.note');
      expect(keys).toContain('lasso-tool');
      expect(keys).toContain('draw-tool');
    }
  });
});

describe('EventStormingPaletteProvider: palette refresh', () => {
  it('re-renders the palette on import.done (imported board may carry a level)', () => {
    const { eventBus, rebuild } = providerHarness();
    eventBus.fire('import.done', { warnings: [] });
    expect(rebuild).toHaveBeenCalledTimes(1);
  });

  it('re-renders after root config updates (setLevel) and their undo/redo', () => {
    const { eventBus, rebuild } = providerHarness();
    eventBus.fire('commandStack.element.updateProperties.postExecuted', {
      context: { element: { id: ROOT_ID } },
    });
    eventBus.fire('commandStack.element.updateProperties.reverted', {
      context: { element: { id: ROOT_ID } },
    });
    expect(rebuild).toHaveBeenCalledTimes(2);
  });

  it('ignores property updates on ordinary elements (labels, colors, retyping)', () => {
    const { eventBus, rebuild } = providerHarness();
    eventBus.fire('commandStack.element.updateProperties.postExecuted', {
      context: { element: { id: 'event_order_placed' } },
    });
    expect(rebuild).not.toHaveBeenCalled();
  });
});

describe('EventStormingPaletteProvider: tooltips', () => {
  // diagram-js renders the hover tooltip from `title` (and mirrors it into aria-label); a native
  // title attribute on the markup would show the browser tooltip on top of it.
  it('gives every entry a title but no native title attribute in its markup', () => {
    const { provider } = providerHarness();
    for (const entry of Object.values(provider.getPaletteEntries())) {
      expect(entry.title).toBeTruthy();
      expect(entry.html).not.toMatch(/\btitle=/);
    }
  });
});
