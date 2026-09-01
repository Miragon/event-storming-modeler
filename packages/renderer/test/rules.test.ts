import { describe, it, expect } from 'vitest';
import type EventBus from 'diagram-js/lib/core/EventBus';
import { ATTACHABLE_STICKY_KINDS, HOST_STICKY_KINDS } from '@miragon/event-storming-schema-model';
import EventStormingRules from '../src/rules/EventStormingRules.js';
import { STICKY_KINDS } from '../src/model/di-types.js';

type RuleHandler = (event: { context: Record<string, unknown> }) => unknown;

/** Captures the rule listeners RuleProvider registers on the event bus. */
function ruleHarness() {
  const handlers = new Map<string, RuleHandler>();
  const eventBus = {
    on: (event: string, _priority: number, handler: RuleHandler) => {
      handlers.set(event, handler);
    },
  } as unknown as EventBus;
  new EventStormingRules(eventBus);
  const canStartConnection = (source: unknown) =>
    handlers.get('commandStack.connection.start.canExecute')!({ context: { source } });
  const canCreateConnection = (source: unknown, target: unknown) =>
    handlers.get('commandStack.connection.create.canExecute')!({ context: { source, target } });
  const canMoveElements = (shapes: unknown[], target?: unknown) =>
    handlers.get('commandStack.elements.move.canExecute')!({ context: { shapes, target } });
  const canResizeShape = (shape: unknown, newBounds?: { width: number; height: number }) =>
    handlers.get('commandStack.shape.resize.canExecute')!({ context: { shape, newBounds } });
  return { canStartConnection, canCreateConnection, canMoveElements, canResizeShape };
}

function sticky(id: string, eventStormingType = 'command') {
  return {
    id,
    eventStormingType,
    eventStormingLabel: id,
    incoming: [] as unknown[],
    outgoing: [] as unknown[],
  };
}

function connect(source: ReturnType<typeof sticky>, target: ReturnType<typeof sticky>) {
  const connection = { source, target, waypoints: [] };
  source.outgoing.push(connection);
  target.incoming.push(connection);
}

describe('EventStormingRules: connection.create', () => {
  it('rejects a same-direction duplicate arrow', () => {
    const { canCreateConnection } = ruleHarness();
    const a = sticky('cmd_a');
    const b = sticky('event_b');
    connect(a, b);
    expect(canCreateConnection(a, b)).toBe(false);
  });

  // Regression: the duplicate check also matched the REVERSE direction, so B -> A could never be
  // drawn although it is a distinct DSL line that imports and round-trips.
  it('allows the reverse arrow when only the opposite direction exists', () => {
    const { canCreateConnection } = ruleHarness();
    const a = sticky('cmd_a');
    const b = sticky('event_b');
    connect(a, b);
    expect(canCreateConnection(b, a)).toEqual({ eventStormingType: 'arrow' });
  });

  it('still rejects self-connections and non-sticky endpoints', () => {
    const { canCreateConnection } = ruleHarness();
    const a = sticky('cmd_a');
    const note = { id: 'note_x', eventStormingType: 'note', incoming: [], outgoing: [] };
    expect(canCreateConnection(a, a)).toBe(false);
    expect(canCreateConnection(a, note)).toBe(false);
  });
});

describe('EventStormingRules: attach (pinning)', () => {
  it('yields the attach verdict for every attachable-over-host pairing', () => {
    const { canMoveElements } = ruleHarness();
    for (const attachable of ATTACHABLE_STICKY_KINDS) {
      for (const host of HOST_STICKY_KINDS) {
        const verdict = canMoveElements([sticky('a', attachable)], sticky('h', host));
        expect(verdict, `${attachable} over ${host}`).toBe('attach');
      }
    }
  });

  it('never attaches to non-host targets (no chains) — the move itself stays allowed', () => {
    const { canMoveElements } = ruleHarness();
    const actor = sticky('actor_a', 'actor');
    // Sanity: the same actor DOES attach to a host kind.
    expect(canMoveElements([actor], sticky('cmd_h', 'command'))).toBe('attach');
    for (const target of [
      sticky('actor_t', 'actor'),
      sticky('hot_t', 'hotspot'),
      { id: 'note_t', eventStormingType: 'note' },
      { id: 'draw_t', eventStormingType: 'drawing' },
      { id: 'event-storming-root' },
      undefined,
    ]) {
      expect(canMoveElements([actor], target)).toBe(true);
    }
  });

  it('attaches only a single attachable — non-attachables and groups just move', () => {
    const { canMoveElements } = ruleHarness();
    const host = sticky('cmd_h', 'command');
    expect(canMoveElements([sticky('hot_a', 'hotspot')], host)).toBe('attach');
    expect(canMoveElements([sticky('evt_a', 'event')], host)).toBe(true);
    expect(canMoveElements([sticky('a', 'actor'), sticky('b', 'hotspot')], host)).toBe(true);
  });
});

describe('EventStormingRules: note attach (pinning)', () => {
  const note = (id: string) => ({ id, eventStormingType: 'note', eventStormingLabel: 'Hint' });

  it('yields the attach verdict for a single note over every host kind', () => {
    const { canMoveElements } = ruleHarness();
    for (const host of HOST_STICKY_KINDS) {
      expect(canMoveElements([note('note_a')], sticky('h', host)), `note over ${host}`).toBe(
        'attach',
      );
    }
  });

  it('never attaches a note to note/actor/hotspot/drawing targets (no chains) — the move stays allowed', () => {
    const { canMoveElements } = ruleHarness();
    for (const target of [
      note('note_t'),
      sticky('actor_t', 'actor'),
      sticky('hot_t', 'hotspot'),
      { id: 'draw_t', eventStormingType: 'drawing' },
    ]) {
      expect(canMoveElements([note('note_a')], target), target.id).toBe(true);
    }
  });

  it('keeps notes non-connectable although they are attachable', () => {
    const { canStartConnection, canCreateConnection } = ruleHarness();
    const source = { ...note('note_a'), incoming: [], outgoing: [] };
    expect(canStartConnection(source)).toBe(false);
    expect(canCreateConnection(source, sticky('cmd_t'))).toBe(false);
  });
});

describe('EventStormingRules: shape.resize', () => {
  const note = { id: 'note_x', eventStormingType: 'note', eventStormingLabel: 'Hint' };

  it('allows resizing notes ONLY — stickies keep fixed sizes, drawings their vertex handles', () => {
    const { canResizeShape } = ruleHarness();
    expect(canResizeShape(note)).toBe(true);
    for (const kind of STICKY_KINDS) {
      expect(canResizeShape(sticky(`s_${kind}`, kind)), kind).toBe(false);
    }
    expect(canResizeShape({ id: 'draw_x', eventStormingType: 'drawing' })).toBe(false);
    expect(canResizeShape(undefined)).toBe(false);
  });

  it('rejects boxes below the 60x40 minimum on the newBounds re-check', () => {
    const { canResizeShape } = ruleHarness();
    expect(canResizeShape(note, { width: 60, height: 40 })).toBe(true);
    expect(canResizeShape(note, { width: 59, height: 40 })).toBe(false);
    expect(canResizeShape(note, { width: 60, height: 39 })).toBe(false);
    expect(canResizeShape(note, { width: 240, height: 160 })).toBe(true);
  });
});
