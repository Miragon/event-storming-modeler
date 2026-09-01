import { describe, it, expect, vi } from 'vitest';
import type { Element } from 'diagram-js/lib/model/Types';
import EventStormingContextPadProvider from '../src/context-pad/EventStormingContextPadProvider.js';
import { STICKY_STYLES } from '../src/draw/styles.js';

function providerHarness() {
  const created: Array<{ kind: string; label: string }> = [];
  const createStart = vi.fn();
  const provider = new EventStormingContextPadProvider(
    { registerProvider: vi.fn() } as never,
    { removeElements: vi.fn() } as never,
    { start: vi.fn() } as never,
    { start: createStart } as never,
    { open: vi.fn() } as never,
    { setStrokeStyle: vi.fn() } as never,
    { activate: vi.fn(), activateConnection: vi.fn() } as never,
    {
      createNew: (kind: string, label: string) => {
        created.push({ kind, label });
        return { id: `${kind}_new`, eventStormingType: kind };
      },
    } as never,
    { open: vi.fn() } as never,
  );
  return { provider, created, createStart };
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

describe('EventStormingContextPadProvider: typed append', () => {
  it('offers one append entry each for event, command and aggregate on a sticky', () => {
    const { provider } = providerHarness();
    const entries = provider.getContextPadEntries(sticky('cmd_a'));
    for (const kind of ['event', 'command', 'aggregate'] as const) {
      const entry = entries[`append-${kind}`];
      expect(entry).toBeDefined();
      expect(entry!.title).toBe(`Append ${STICKY_STYLES[kind].label} (auto-connect)`);
      expect(entry!.html).toContain('draggable="true"');
      expect(entry!.html).toContain(STICKY_STYLES[kind].fill);
    }
  });

  it('appending starts a create with the chosen kind and the sticky as source', () => {
    const { provider, created, createStart } = providerHarness();
    const source = sticky('event_a', 'event');
    const entries = provider.getContextPadEntries(source);
    const action = entries['append-aggregate']!.action as {
      click: (event: Event) => void;
    };
    action.click(new Event('click'));
    expect(created).toEqual([{ kind: 'aggregate', label: STICKY_STYLES.aggregate.label }]);
    expect(createStart).toHaveBeenCalledWith(
      expect.any(Event),
      expect.objectContaining({ eventStormingType: 'aggregate' }),
      { source },
    );
  });

  it('offers no append entries on notes and drawings', () => {
    const { provider } = providerHarness();
    for (const kind of ['note', 'drawing'] as const) {
      const entries = provider.getContextPadEntries(sticky(`${kind}_a`, kind));
      expect(Object.keys(entries).filter((key) => key.startsWith('append-'))).toEqual([]);
    }
  });
});
