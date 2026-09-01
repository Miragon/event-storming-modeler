import { describe, it, expect } from 'vitest';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import EventStormingElementFactory from '../src/model/EventStormingElementFactory.js';
import { STICKY_STYLES, noteMetrics } from '../src/draw/styles.js';

/** Factory with mocked ElementFactory/Registry (createShape returns the attributes). */
function factory(existing: Array<{ id?: string; eventStormingLabel?: string }>) {
  const elementFactory = {
    createShape: (attrs: Record<string, unknown>) => attrs,
    createConnection: (attrs: Record<string, unknown>) => attrs,
  } as unknown as ElementFactory;
  const registry = {
    getAll: () => existing,
    get: (id: string) => existing.find((el) => el.id === id),
  } as unknown as ElementRegistry;
  return new EventStormingElementFactory(elementFactory, registry);
}

function labels(existingLabels: string[]): Array<{ eventStormingLabel: string }> {
  return existingLabels.map((eventStormingLabel) => ({ eventStormingLabel }));
}

describe('EventStormingElementFactory.createNew: numbered default labels (UX)', () => {
  // Duplicate labels are legal (the DSL disambiguates via ids) — the numbering only keeps
  // consecutive palette creates tellable apart ("Domain Event 2" instead of identical defaults).
  it('assigns the base label when free', () => {
    expect(factory([]).createNew('event', 'Domain Event').eventStormingLabel).toBe('Domain Event');
  });

  it('appends a counter when the label is taken', () => {
    expect(
      factory(labels(['Domain Event'])).createNew('event', 'Domain Event').eventStormingLabel,
    ).toBe('Domain Event 2');
    expect(
      factory(labels(['Domain Event', 'Domain Event 2'])).createNew('event', 'Domain Event')
        .eventStormingLabel,
    ).toBe('Domain Event 3');
  });

  it('applies to other kinds as well (e.g. note)', () => {
    expect(factory(labels(['Note'])).createNew('note', 'Note').eventStormingLabel).toBe('Note 2');
  });
});

describe('EventStormingElementFactory: DSL-style ids for interactive creates', () => {
  // Ids surface in the `.storm` text once labels are duplicated (`(id …)` / `#id`) — they must
  // read like the DSL allocator's, not like diagram-js `shape_N`.
  it('assigns `<kind-prefix>_<n>` per kind on createNew', () => {
    expect(factory([]).createNew('event', 'Domain Event').id).toBe('event_1');
    expect(factory([]).createNew('command', 'Command').id).toBe('cmd_1');
    expect(factory([]).createNew('actor', 'Actor').id).toBe('actor_1');
    expect(factory([]).createNew('aggregate', 'Aggregate').id).toBe('agg_1');
    expect(factory([]).createNew('policy', 'Policy').id).toBe('policy_1');
    expect(factory([]).createNew('readmodel', 'Read Model').id).toBe('read_1');
    expect(factory([]).createNew('external', 'External System').id).toBe('ext_1');
    expect(factory([]).createNew('hotspot', 'Hotspot').id).toBe('hot_1');
    expect(factory([]).createNew('note', 'Note').id).toBe('note_1');
  });

  it('skips ids already present in the registry', () => {
    const f = factory([{ id: 'agg_1' }, { id: 'agg_2' }]);
    expect(f.createNew('aggregate', 'Aggregate').id).toBe('agg_3');
  });

  it('allocateId honors batch-reserved ids (multi-shape paste before placement)', () => {
    const f = factory([{ id: 'event_1' }]);
    expect(f.allocateId('event', new Set(['event_2', 'event_3']))).toBe('event_4');
  });

  it('assigns a draw_ id to tool-drawn drawings, keeps explicit ids on import', () => {
    const pts = [
      { x: 10, y: 10 },
      { x: 50, y: 40 },
    ];
    expect(factory([]).drawingFromCanvasPoints(pts).id).toBe('draw_1');
    expect(factory([]).drawingFromCanvasPoints(pts, { id: 'draw_sketch' }).id).toBe('draw_sketch');
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

describe('EventStormingElementFactory.createNote: auto vs manual size', () => {
  it('uses the text metrics when no size is stored', () => {
    const shape = factory([]).createNote({
      id: 'note_hint',
      elementType: 'note',
      label: 'Hint',
      position: { x: 100, y: 100 },
    });
    const { width, height } = noteMetrics('Hint');
    expect(shape.width).toBe(width);
    expect(shape.height).toBe(height);
  });

  it('honors a manual size (user resized by hand), centered on the position', () => {
    const shape = factory([]).createNote({
      id: 'note_kickoff',
      elementType: 'note',
      label: 'Kickoff',
      position: { x: 300, y: 200 },
      size: { width: 240, height: 160 },
    });
    expect(shape.width).toBe(240);
    expect(shape.height).toBe(160);
    expect(shape.x).toBe(300 - 240 / 2);
    expect(shape.y).toBe(200 - 160 / 2);
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
