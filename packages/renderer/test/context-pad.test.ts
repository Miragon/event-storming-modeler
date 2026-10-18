import { describe, it, expect, vi } from 'vitest';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type { Element } from 'diagram-js/lib/model/Types';
import type { BoardLevel } from '@miragon/event-storming-schema-model';
import EventStormingContextPadProvider from '../src/context-pad/EventStormingContextPadProvider.js';
import EventStormingElementFactory from '../src/model/EventStormingElementFactory.js';

function providerHarness(level: BoardLevel = 'design') {
  const createStart = vi.fn();
  // Real element factory (raw factory mocked to return the attrs): the append action must hand
  // a REAL provisional blank sticky to create.start, not whatever a factory mock would fake.
  const esFactory = new EventStormingElementFactory(
    { createShape: (attrs: Record<string, unknown>) => attrs } as unknown as ElementFactory,
    { getAll: () => [], get: () => undefined } as unknown as ElementRegistry,
  );
  const provider = new EventStormingContextPadProvider(
    { registerProvider: vi.fn() } as never,
    { removeElements: vi.fn() } as never,
    { start: vi.fn() } as never,
    { start: createStart } as never,
    { open: vi.fn() } as never,
    { setStrokeStyle: vi.fn(), getLevel: () => level } as never,
    { activate: vi.fn(), activateConnection: vi.fn() } as never,
    esFactory as never,
    { open: vi.fn() } as never,
  );
  return { provider, createStart };
}

function sticky(id: string, kind = 'command') {
  return {
    id,
    eventStormingType: kind,
    eventStormingLabel: id,
    incoming: [],
    outgoing: [],
  } as unknown as Element;
}

describe('EventStormingContextPadProvider: blank append', () => {
  it('offers ONE append entry (blank sticky, type chosen after placing) on a sticky', () => {
    const { provider } = providerHarness();
    const entries = provider.getContextPadEntries(sticky('cmd_a'));
    const entry = entries['append'];
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Append sticky (auto-connect, choose the type after placing)');
    expect(entry!.group).toBe('append');
    expect(entry!.html).toContain('draggable="true"');
    // The typed per-kind entries are gone — the popup picks the kind now.
    expect(Object.keys(entries).filter((key) => key.startsWith('append-'))).toEqual([]);
  });

  it('appending starts a create with a provisional BLANK sticky and the sticky as source', () => {
    const { provider, createStart } = providerHarness();
    const source = sticky('event_a', 'event');
    const entries = provider.getContextPadEntries(source);
    const action = entries['append']!.action as { click: (event: Event) => void };
    action.click(new Event('click'));
    expect(createStart).toHaveBeenCalledWith(
      expect.any(Event),
      expect.objectContaining({
        eventStormingType: 'event',
        eventStormingLabel: '',
        provisional: true,
      }),
      { source },
    );
  });

  it('offers no append entry on notes and drawings', () => {
    const { provider } = providerHarness();
    for (const kind of ['note', 'drawing'] as const) {
      const entries = provider.getContextPadEntries(sticky(`${kind}_a`, kind));
      expect(entries['append']).toBeUndefined();
    }
  });

  // The kind choice happens in the (level-filtered) popup AFTER placing — the entry itself is
  // level-independent, unlike the old typed append entries.
  it('offers the append entry on every workshop level', () => {
    for (const level of ['big-picture', 'process', 'design'] as const) {
      const { provider } = providerHarness(level);
      const entries = provider.getContextPadEntries(sticky('cmd_a'));
      expect(entries['append'], level).toBeDefined();
    }
  });

  // Stickies and notes carry their notation color — only drawings are recolorable.
  it('offers the color picker for drawings only', () => {
    const { provider } = providerHarness();
    const drawing = {
      ...sticky('draw_a', 'drawing'),
      drawingPoints: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    } as unknown as Element;
    expect(provider.getContextPadEntries(drawing)['color']).toBeDefined();
    for (const kind of ['event', 'command', 'aggregate', 'hotspot', 'note'] as const) {
      expect(provider.getContextPadEntries(sticky(`${kind}_a`, kind))['color'], kind).toBe(
        undefined,
      );
    }
  });
});

describe('EventStormingContextPadProvider: read-only lock', () => {
  it('offers no entry while the canvas is locked and closes an open pad when it locks', () => {
    const close = vi.fn();
    let listener: ((event: { readOnly?: boolean }) => void) | undefined;
    let readOnly = false;
    const provider = new EventStormingContextPadProvider(
      { registerProvider: vi.fn(), close } as never,
      { removeElements: vi.fn() } as never,
      { start: vi.fn() } as never,
      { start: vi.fn() } as never,
      { open: vi.fn() } as never,
      { setStrokeStyle: vi.fn(), getLevel: () => 'design' } as never,
      { activate: vi.fn(), activateConnection: vi.fn() } as never,
      { createProvisional: vi.fn() } as never,
      { open: vi.fn() } as never,
      { on: (_name: string, callback: typeof listener) => (listener = callback) } as never,
      { isReadOnly: () => readOnly },
    );
    expect(Object.keys(provider.getContextPadEntries(sticky('cmd_a')))).not.toEqual([]);
    readOnly = true;
    listener?.({ readOnly: true });
    expect(close).toHaveBeenCalledTimes(1);
    expect(provider.getContextPadEntries(sticky('cmd_a'))).toEqual({});
  });

  it('draws every entry with a 16px Lucide icon at stroke 2.5', () => {
    const { provider } = providerHarness();
    const entries = Object.values(provider.getContextPadEntries(sticky('cmd_a')));
    expect(entries.length).toBeGreaterThan(3);
    for (const entry of entries) {
      expect(entry.html).toContain('width="16"');
      expect(entry.html).toContain('stroke-width="2.5"');
      expect(entry.html).toContain('stroke="currentColor"');
      expect(entry.html).toContain('fill="none"');
    }
  });
});

describe('EventStormingContextPadProvider: entry order', () => {
  it('ends with delete, in a group of its own', () => {
    const { provider } = providerHarness();
    const entries = provider.getContextPadEntries(sticky('cmd_a'));
    expect(Object.keys(entries).at(-1)).toBe('delete');
    expect(entries['delete']!.group).toBe('delete');
    expect(Object.values(entries).filter((entry) => entry.group === 'delete')).toHaveLength(1);
  });
});
