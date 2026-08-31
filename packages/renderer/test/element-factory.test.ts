import { describe, it, expect } from 'vitest';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import EventStormingElementFactory from '../src/model/EventStormingElementFactory.js';
import { STICKY_STYLES, noteMetrics } from '../src/draw/styles.js';

/** Factory with mocked ElementFactory/Registry (createShape returns the attributes). */
function factory(existingLabels: string[]): EventStormingElementFactory {
  const elementFactory = {
    createShape: (attrs: Record<string, unknown>) => attrs,
    createConnection: (attrs: Record<string, unknown>) => attrs,
  } as unknown as ElementFactory;
  const registry = {
    getAll: () => existingLabels.map((eventStormingLabel) => ({ eventStormingLabel })),
  } as unknown as ElementRegistry;
  return new EventStormingElementFactory(elementFactory, registry);
}

describe('EventStormingElementFactory.createNew: unique labels', () => {
  // Regression: duplicate labels cause ID collisions on the DSL round-trip and lose arrows.
  it('assigns the base label when free', () => {
    expect(factory([]).createNew('event', 'Domain Event').eventStormingLabel).toBe('Domain Event');
  });

  it('appends a counter when the label is taken', () => {
    expect(factory(['Domain Event']).createNew('event', 'Domain Event').eventStormingLabel).toBe(
      'Domain Event 2',
    );
    expect(
      factory(['Domain Event', 'Domain Event 2']).createNew('event', 'Domain Event')
        .eventStormingLabel,
    ).toBe('Domain Event 3');
  });

  it('applies to other kinds as well (e.g. note)', () => {
    expect(factory(['Note']).createNew('note', 'Note').eventStormingLabel).toBe('Note 2');
  });

  it('uniqueLabel excludes the element being renamed itself (rename to its own name)', () => {
    const f = factory([]);
    const registry = {
      getAll: () => [
        { id: 'event_order_placed', eventStormingLabel: 'Order Placed' },
        { id: 'cmd_place_order', eventStormingLabel: 'Place Order' },
      ],
    };
    Object.assign(f, { elementRegistry: registry });
    expect(f.uniqueLabel('Order Placed', 'event_order_placed')).toBe('Order Placed');
    expect(f.uniqueLabel('Place Order', 'event_order_placed')).toBe('Place Order 2');
  });
});

describe('EventStormingElementFactory.createNew: per-kind defaults', () => {
  it('sizes every sticky kind per STICKY_STYLES', () => {
    for (const [kind, style] of Object.entries(STICKY_STYLES)) {
      const shape = factory([]).createNew(kind as keyof typeof STICKY_STYLES, style.label);
      expect(shape.eventStormingType, kind).toBe(kind);
      expect(shape.width, kind).toBe(style.width);
      expect(shape.height, kind).toBe(style.height);
    }
  });

  it('sizes a note from its text (noteMetrics)', () => {
    const shape = factory([]).createNew('note', 'Big-picture session\nsecond line');
    const { width, height } = noteMetrics('Big-picture session\nsecond line');
    expect(shape.width).toBe(width);
    expect(shape.height).toBe(height);
  });
});

describe('EventStormingElementFactory.createSticky: center -> top-left', () => {
  it('places the shape so the schema position is its center', () => {
    const shape = factory([]).createSticky({
      id: 'event_order_placed',
      elementType: 'event',
      label: 'Order Placed',
      position: { x: 620, y: 300 },
    });
    expect(shape.x).toBe(620 - STICKY_STYLES.event.width / 2);
    expect(shape.y).toBe(300 - STICKY_STYLES.event.height / 2);
    expect(shape.width).toBe(STICKY_STYLES.event.width);
    expect(shape.height).toBe(STICKY_STYLES.event.height);
  });

  it('rejects non-sticky kinds (note/drawing have their own constructors)', () => {
    expect(() =>
      factory([]).createSticky({
        id: 'note_hint',
        elementType: 'note',
        label: 'Hint',
        position: { x: 0, y: 0 },
      }),
    ).toThrow(/not a sticky kind/);
  });
});
