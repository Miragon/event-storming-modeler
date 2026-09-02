import { describe, it, expect, vi } from 'vitest';
import type { PopupMenuTarget } from 'diagram-js/lib/features/popup-menu/PopupMenu';
import type { BoardLevel } from '@miragon/event-storming-schema-model';
import EventStormingElementSettingsProvider from '../src/popup/EventStormingElementSettingsProvider.js';

function providerHarness(level: BoardLevel = 'design') {
  const setStickyKind = vi.fn();
  const provider = new EventStormingElementSettingsProvider(
    { registerProvider: vi.fn() } as never,
    { getLevel: () => level, setStickyKind } as never,
  );
  return { provider, setStickyKind };
}

function sticky(kind: string): PopupMenuTarget {
  return {
    id: `${kind}_a`,
    eventStormingType: kind,
    eventStormingLabel: kind,
  } as unknown as PopupMenuTarget;
}

describe('EventStormingElementSettingsProvider: level filtering', () => {
  it('offers per workshop level exactly the allowed kinds', () => {
    const expected: Record<BoardLevel, string[]> = {
      'big-picture': ['kind-event', 'kind-actor', 'kind-external', 'kind-hotspot'],
      process: [
        'kind-event',
        'kind-command',
        'kind-actor',
        'kind-policy',
        'kind-readmodel',
        'kind-external',
        'kind-hotspot',
      ],
      design: [
        'kind-event',
        'kind-command',
        'kind-actor',
        'kind-aggregate',
        'kind-policy',
        'kind-readmodel',
        'kind-external',
        'kind-hotspot',
      ],
    };
    for (const [level, keys] of Object.entries(expected)) {
      const { provider } = providerHarness(level as BoardLevel);
      expect(Object.keys(provider.getPopupMenuEntries(sticky('event')))).toEqual(keys);
    }
  });

  // Levels are not validation: an out-of-level sticky (imported/pasted) must still show its own
  // kind — checked — so the popup never hides what the element currently IS.
  it('always includes the selected element’s current kind, checked', () => {
    const { provider } = providerHarness('big-picture');
    const entries = provider.getPopupMenuEntries(sticky('aggregate'));
    expect(Object.keys(entries)).toEqual([
      'kind-event',
      'kind-actor',
      'kind-aggregate',
      'kind-external',
      'kind-hotspot',
    ]);
    expect(entries['kind-aggregate']!.label).toBe('✓ Aggregate');
    expect(entries['kind-event']!.label).toBe('Domain Event');
  });
});

describe('EventStormingElementSettingsProvider: provisional (blank append) sticky', () => {
  const provisional = () =>
    ({
      id: 'event_1',
      eventStormingType: 'event',
      eventStormingLabel: '',
      provisional: true,
    }) as unknown as PopupMenuTarget;

  // The blank sticky has NO current type yet — its placeholder kind gets neither a checkmark
  // nor a level-filter bypass.
  it('shows the level-filtered kinds without any checkmark', () => {
    const { provider } = providerHarness('design');
    const entries = provider.getPopupMenuEntries(provisional());
    for (const [key, entry] of Object.entries(entries)) {
      expect(entry.label, key).not.toContain('✓');
    }
    expect(entries['kind-event']!.label).toBe('Domain Event');
  });

  // The current-kind exception exists for elements that ARE something; a provisional
  // placeholder kind must not sneak past the level filter.
  it('applies the plain level filter without the current-kind exception', () => {
    const { provider } = providerHarness('big-picture');
    const entries = provider.getPopupMenuEntries({
      ...(provisional() as object),
      eventStormingType: 'aggregate',
    } as unknown as PopupMenuTarget);
    expect(Object.keys(entries)).toEqual([
      'kind-event',
      'kind-actor',
      'kind-external',
      'kind-hotspot',
    ]);
  });
});
