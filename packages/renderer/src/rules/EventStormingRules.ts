import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import type EventBus from 'diagram-js/lib/core/EventBus';
import {
  isAttachableSticky,
  isHostSticky,
  isSticky,
  type EventStormingShape,
} from '../model/di-types.js';

/**
 * Is there already an arrow from `source` to `target` in this SAME direction? Arrows are
 * directional — the reverse arrow (B -> A alongside A -> B) is a distinct DSL line that imports
 * and round-trips, so it must stay drawable.
 */
function alreadyConnected(source: EventStormingShape, target: EventStormingShape): boolean {
  return (source.outgoing ?? []).some((c) => c.target === (target as unknown));
}

/**
 * Pinning (bpmn-js boundary-event pattern): a SINGLE actor/hotspot dragged over a host-kind
 * sticky yields the diagram-js 'attach' verdict — the drop then sets `host` while the parent
 * stays the root. Host kinds exclude the attachable kinds, so attach chains cannot form.
 */
function canAttach(shapes: readonly unknown[], target: unknown): 'attach' | false {
  if (shapes.length !== 1) return false;
  if (!isAttachableSticky(shapes[0])) return false;
  if (!isHostSticky(target)) return false;
  return 'attach';
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

    // Moving is always allowed; dropping on a non-root target never nests (the ordering
    // provider retargets the parent to the root) — except for the 'attach' verdict, which
    // pins the dragged sticky to the hovered host instead.
    this.addRule(
      ['shape.move', 'elements.move'],
      (context: { shapes?: unknown[]; shape?: unknown; target?: unknown }) => {
        const shapes = context.shapes ?? (context.shape ? [context.shape] : []);
        return canAttach(shapes, context.target) || true;
      },
    );
    this.addRule('shape.create', () => true);
    // Group create (paste preview): diagram-js Create checks this rule for element arrays.
    this.addRule('elements.create', () => true);
    // Nothing is resizable: stickies have fixed per-kind sizes, notes auto-size to their text,
    // drawings are reshaped via their vertex handles.
    this.addRule('shape.resize', () => false);
  }
}
