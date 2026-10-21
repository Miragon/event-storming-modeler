import { describe, it, expect, vi } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import type { BoardLevel } from '@miragon/event-storming-schema-model';
import EventStormingPaletteProvider, {
  type EventStormingPaletteConfig,
} from '../src/palette/EventStormingPaletteProvider.js';
import { ROOT_ID } from '../src/model/di-types.js';

function providerHarness(level: BoardLevel = 'design') {
  const eventBus = new EventBus();
  const rebuild = vi.fn();
  const factory = { createNew: vi.fn() };
  const provider = new EventStormingPaletteProvider(
    { registerProvider: vi.fn(), _rebuild: rebuild } as never,
    { start: vi.fn() } as never,
    factory as never,
    { activateSelection: vi.fn() } as never,
    { toggle: vi.fn() } as never,
    { getLevel: () => level } as never,
    eventBus,
  );
  return { provider, eventBus, rebuild, factory };
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

describe('EventStormingPaletteProvider: titles and shortcuts', () => {
  // The tooltip chip and aria-keyshortcuts are built from `shortcut`; a title like
  // "Domain Event — E" would show the key twice and hide it from assistive technology.
  it('carries sentence-case titles and the single-key shortcuts separately', () => {
    const { provider } = providerHarness('design');
    const entries = provider.getPaletteEntries();
    const summary = Object.fromEntries(
      Object.entries(entries).map(([action, entry]) => [
        action,
        { title: entry.title, shortcut: entry.shortcut, group: entry.group },
      ]),
    );
    expect(summary).toEqual({
      'lasso-tool': { title: 'Lasso', shortcut: 'L', group: 'tools' },
      'draw-tool': { title: 'Draw', shortcut: undefined, group: 'tools' },
      'create.event': { title: 'Domain event', shortcut: 'E', group: 'stickies-1' },
      'create.command': { title: 'Command', shortcut: 'C', group: 'stickies-1' },
      'create.actor': { title: 'Actor', shortcut: undefined, group: 'stickies-1' },
      'create.aggregate': { title: 'Aggregate', shortcut: undefined, group: 'stickies-1' },
      'create.policy': { title: 'Policy', shortcut: undefined, group: 'stickies-2' },
      'create.readmodel': { title: 'Read model', shortcut: undefined, group: 'stickies-2' },
      'create.external': { title: 'External system', shortcut: undefined, group: 'stickies-2' },
      'create.hotspot': { title: 'Hotspot', shortcut: undefined, group: 'stickies-3' },
      'create.note': { title: 'Note', shortcut: undefined, group: 'stickies-3' },
    });
    for (const entry of Object.values(entries)) expect(entry.title).not.toMatch(/—/);
  });

  // Labels are canvas content and travel through the DSL; the palette titles are chrome only.
  it('keeps the default sticky labels of the created elements', () => {
    const { provider, factory } = providerHarness('design');
    const entries = provider.getPaletteEntries();
    for (const action of ['create.event', 'create.readmodel', 'create.external', 'create.note']) {
      const entry = entries[action]!;
      (entry.action as { click: (event: Event) => void }).click(new Event('click'));
    }
    expect(factory.createNew.mock.calls).toEqual([
      ['event', 'Domain Event'],
      ['readmodel', 'Read Model'],
      ['external', 'External System'],
      ['note', 'Note'],
    ]);
  });

  it('draws the tools with the Lucide icons in currentColor', () => {
    const { provider } = providerHarness();
    const entries = provider.getPaletteEntries();
    for (const action of ['lasso-tool', 'draw-tool']) {
      const html = entries[action]!.html!;
      expect(html).toContain('stroke="currentColor"');
      expect(html).toContain('width="20"');
      expect(html).toContain('stroke-width="2"');
      expect(html).toContain('aria-hidden="true"');
    }
    expect(entries['lasso-tool']!.html).toContain('M12.034 12.681');
    expect(entries['draw-tool']!.html).toContain('M6.5 17.5 17.5 6.5');
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

describe('EventStormingPaletteProvider: Enter or Space on a creating entry (guide §5.5)', () => {
  const CHROME_INSETS = { top: 88, right: 24, bottom: 64, left: 24 };

  function keyboardHarness(
    freeArea: EventStormingPaletteConfig['freeArea'] = { insets: () => CHROME_INSETS },
    config: EventStormingPaletteConfig = { freeArea },
  ) {
    const eventBus = new EventBus();
    const placed: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
    let next = 0;
    const factory = {
      createNew: vi.fn(() => ({ id: `event_${++next}`, width: 130, height: 90 })),
    };
    const create = { start: vi.fn() };
    const canvas = {
      viewbox: () => ({ x: 100, y: 50, scale: 2, outer: { width: 1000, height: 800 } }),
      getRootElement: () => ({ id: ROOT_ID }),
      focus: vi.fn(),
    };
    const modeling = {
      createShape: vi.fn(
        (shape: { id: string; width: number; height: number }, at: { x: number; y: number }) => {
          const created = {
            ...shape,
            eventStormingType: 'event',
            x: at.x - shape.width / 2,
            y: at.y - shape.height / 2,
          };
          placed.push(created);
          return created;
        },
      ),
    };
    const selection = { select: vi.fn() };
    const elementRegistry = { filter: (fn: (element: unknown) => boolean) => placed.filter(fn) };
    const labelEditing = { activate: vi.fn() };
    const provider = new EventStormingPaletteProvider(
      { registerProvider: vi.fn(), _rebuild: vi.fn() } as never,
      create as never,
      factory as never,
      { activateSelection: vi.fn() } as never,
      { toggle: vi.fn() } as never,
      { getLevel: () => 'design' } as never,
      eventBus,
      canvas as never,
      modeling as never,
      selection as never,
      elementRegistry as never,
      labelEditing as never,
      config,
    );
    const click = (detail: number) =>
      (provider.getPaletteEntries()['create.event']!.action as { click(event: Event): void }).click(
        { type: 'click', detail } as unknown as Event,
      );
    return { click, create, canvas, modeling, selection, labelEditing };
  }

  it('places the element in the centre of the free rectangle, selected, with its label editor open', () => {
    const { click, create, canvas, modeling, selection, labelEditing } = keyboardHarness();
    click(0);
    expect(create.start).not.toHaveBeenCalled();
    // Free rectangle 952 x 648 from (24, 88) on screen; at scale 2 its centre is (100 + 500/2,
    // 50 + 412/2) on the board.
    expect(modeling.createShape.mock.calls[0]![1]).toEqual({ x: 350, y: 256 });
    expect(selection.select).toHaveBeenCalledWith(modeling.createShape.mock.results[0]!.value);
    expect(canvas.focus).toHaveBeenCalledTimes(1);
    expect(labelEditing.activate).toHaveBeenCalledWith(modeling.createShape.mock.results[0]!.value);
  });

  it('moves 24px down and right while the centre is taken', () => {
    const { click, modeling } = keyboardHarness();
    click(0);
    click(0);
    click(0);
    expect(modeling.createShape.mock.calls.map((call) => call[1])).toEqual([
      { x: 350, y: 256 },
      { x: 374, y: 280 },
      { x: 398, y: 304 },
    ]);
  });

  it('takes the free centre itself when the host passes `freeArea: { center }`', () => {
    const { click, modeling } = keyboardHarness({ center: () => ({ x: 420, y: 310 }) });
    click(0);
    expect(modeling.createShape.mock.calls[0]![1]).toEqual({ x: 420, y: 310 });
  });

  it('falls back to the centre of the container while the host has no centre yet', () => {
    const { click, modeling } = keyboardHarness({ center: () => undefined });
    click(0);
    // The whole 1000 x 800 container at scale 2 from (100, 50).
    expect(modeling.createShape.mock.calls[0]![1]).toEqual({ x: 350, y: 250 });
  });

  it('still reads the deprecated freeRectInsets of the palette config', () => {
    const { click, modeling } = keyboardHarness(undefined, { freeRectInsets: () => CHROME_INSETS });
    click(0);
    expect(modeling.createShape.mock.calls[0]![1]).toEqual({ x: 350, y: 256 });
  });

  it('keeps the pointer create for a real click', () => {
    const { click, create, modeling } = keyboardHarness();
    click(1);
    expect(create.start).toHaveBeenCalledTimes(1);
    expect(modeling.createShape).not.toHaveBeenCalled();
  });
});
