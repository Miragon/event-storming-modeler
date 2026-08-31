import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import type EventBus from 'diagram-js/lib/core/EventBus';
import { isSticky, type EventStormingShape } from '../model/di-types.js';

/**
 * Is there already an arrow from `source` to `target` in this SAME direction? Arrows are
 * directional — the reverse arrow (B -> A alongside A -> B) is a distinct DSL line that imports
 * and round-trips, so it must stay drawable.
 */
function alreadyConnected(source: EventStormingShape, target: EventStormingShape): boolean {
  return (source.outgoing ?? []).some((c) => c.target === (target as unknown));
}

/**
 * Allowed edit operations. On success the `connection.create` rule returns the new connection's
 * attributes. Arrows connect the eight sticky kinds; notes and drawings are annotation-only and
 * never edge endpoints (they are also exempt from unique labels for the same reason).
 */
export default class EventStormingRules extends RuleProvider {
  static override $inject = ['eventBus'];

  constructor(eventBus: EventBus) {
    super(eventBus);
  }

  override init(): void {
    this.addRule('connection.start', (context: { source?: unknown }) => isSticky(context.source));

    this.addRule('connection.create', (context: { source?: unknown; target?: unknown }) => {
      const { source, target } = context;
      if (!isSticky(source) || !isSticky(target)) return false;
      if (source === target) return false;
      // Same-direction duplicate arrows are never meaningful (and indistinguishable in the
      // DSL) — prevent them instead of silently stacking.
      if (alreadyConnected(source, target)) return false;
      return { eventStormingType: 'arrow' };
    });

    this.addRule(['shape.move', 'elements.move'], () => true);
    this.addRule('shape.create', () => true);
    // Group create (paste preview): diagram-js Create checks this rule for element arrays.
    this.addRule('elements.create', () => true);
    // Nothing is resizable: stickies have fixed per-kind sizes, notes auto-size to their text,
    // drawings are reshaped via their vertex handles.
    this.addRule('shape.resize', () => false);
  }
}
