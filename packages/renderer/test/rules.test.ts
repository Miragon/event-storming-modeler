import { describe, it, expect } from 'vitest';
import type EventBus from 'diagram-js/lib/core/EventBus';
import EventStormingRules from '../src/rules/EventStormingRules.js';

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
  const canCreateConnection = (source: unknown, target: unknown) =>
    handlers.get('commandStack.connection.create.canExecute')!({ context: { source, target } });
  return { canCreateConnection };
}

function sticky(id: string) {
  return {
    id,
    eventStormingType: 'command',
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
