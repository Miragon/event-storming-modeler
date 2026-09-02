import { describe, it, expect } from 'vitest';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type Create from 'diagram-js/lib/features/create/Create';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Mouse from 'diagram-js/lib/features/mouse/Mouse';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import EventStormingCopyPaste from '../src/modeling/EventStormingCopyPaste.js';
import EventStormingElementFactory from '../src/model/EventStormingElementFactory.js';
import { STICKY_STYLES, noteMetrics } from '../src/draw/styles.js';

interface CreatedShape {
  id: string;
  eventStormingType: string;
  eventStormingLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  host?: CreatedShape;
  alignHorizontal?: string;
  alignVertical?: string;
}

function harness(selected: Array<Record<string, unknown>>) {
  const created: CreatedShape[][] = [];
  const elementFactory = {
    createShape: (attrs: Record<string, unknown>) => attrs,
    createConnection: (attrs: Record<string, unknown>) => attrs,
  } as unknown as ElementFactory;
  const registry = {
    getAll: () => selected,
    get: (id: string) => selected.find((el) => el['id'] === id),
  } as unknown as ElementRegistry;
  const copyPaste = new EventStormingCopyPaste(
    { get: () => selected, select: () => {} } as unknown as Selection,
    {
      createElements: (elements: CreatedShape[]) => {
        created.push(elements);
        return elements;
      },
    } as unknown as Modeling,
    elementFactory,
    new EventStormingElementFactory(elementFactory, registry),
    { getRootElement: () => ({ id: 'event-storming-root' }) } as unknown as Canvas,
    {} as unknown as Create,
    { getLastMoveEvent: () => null } as unknown as Mouse,
  );
  return { copyPaste, created };
}

describe('EventStormingCopyPaste: clones keep the label, get fresh DSL-style ids', () => {
  // Duplicate labels are legal — the DSL disambiguates via `(id …)`/`#id`, so a paste keeps the
  // source label verbatim and only the (possibly DSL-visible) id is fresh.
  it('keeps the sticky label verbatim and allocates a `<kind-prefix>_<n>` id', () => {
    const sticky = {
      id: 'event_order_placed',
      eventStormingType: 'event',
      eventStormingLabel: 'Order Placed',
      x: 200,
      y: 300,
      width: STICKY_STYLES.event.width,
      height: STICKY_STYLES.event.height,
    };
    const { copyPaste, created } = harness([sticky]);

    expect(copyPaste.duplicate()).toBe(true);

    const clone = created[0]![0]!;
    expect(clone.eventStormingLabel).toBe('Order Placed');
    expect(clone.id).toBe('event_1');
    expect(clone.width).toBe(STICKY_STYLES.event.width);
    expect(clone.height).toBe(STICKY_STYLES.event.height);
    expect(clone.x).toBe(sticky.x);
    expect(clone.y).toBe(sticky.y);
  });

  it('allocates distinct ids within one paste batch (clones are not in the registry yet)', () => {
    const sticky = (id: string, label: string, x: number) => ({
      id,
      eventStormingType: 'event',
      eventStormingLabel: label,
      x,
      y: 300,
      width: STICKY_STYLES.event.width,
      height: STICKY_STYLES.event.height,
    });
    const { copyPaste, created } = harness([
      sticky('event_1', 'Order Placed', 200),
      sticky('event_b', 'Order Shipped', 400),
    ]);

    expect(copyPaste.duplicate()).toBe(true);

    const [first, second] = created[0]! as [CreatedShape, CreatedShape];
    expect(first.id).toBe('event_2');
    expect(second.id).toBe('event_3');
    expect(first.eventStormingLabel).toBe('Order Placed');
    expect(second.eventStormingLabel).toBe('Order Shipped');
  });
});

describe('EventStormingCopyPaste: pasted note box', () => {
  it('keeps an AUTO-sized box as-is (same label => same text metrics)', () => {
    const base = noteMetrics('Risk');
    const note = {
      id: 'note_risk',
      eventStormingType: 'note',
      eventStormingLabel: 'Risk',
      x: 100,
      y: 100,
      width: base.width,
      height: base.height,
    };
    const { copyPaste, created } = harness([note]);

    expect(copyPaste.duplicate()).toBe(true);

    const clone = created[0]![0]!;
    expect(clone.eventStormingLabel).toBe('Risk');
    expect(clone.id).toBe('note_1');
    expect(clone.width).toBe(base.width);
    expect(clone.height).toBe(base.height);
    expect(clone.x).toBe(note.x);
    expect(clone.y).toBe(note.y);
  });

  it('keeps a MANUALLY sized box on the clone (resize feature behavior)', () => {
    const note = {
      id: 'note_risk',
      eventStormingType: 'note',
      eventStormingLabel: 'Risk',
      x: 100,
      y: 100,
      width: 240,
      height: 160,
    };
    const { copyPaste, created } = harness([note]);

    expect(copyPaste.duplicate()).toBe(true);

    const clone = created[0]![0]!;
    expect(clone.eventStormingLabel).toBe('Risk');
    expect(clone.width).toBe(240);
    expect(clone.height).toBe(160);
    expect(clone.x).toBe(note.x);
    expect(clone.y).toBe(note.y);
  });

  it('carries the align DI props onto the clone (alignment travels with the paste)', () => {
    const base = noteMetrics('Risk');
    const note = {
      id: 'note_risk',
      eventStormingType: 'note',
      // The markdown subset lives INSIDE the label, so it round-trips with the verbatim copy.
      eventStormingLabel: '**Risk**',
      x: 100,
      y: 100,
      width: base.width,
      height: base.height,
      alignHorizontal: 'center',
      alignVertical: 'bottom',
    };
    const { copyPaste, created } = harness([note]);

    expect(copyPaste.duplicate()).toBe(true);

    const clone = created[0]![0]!;
    expect(clone.eventStormingLabel).toBe('**Risk**');
    expect(clone.alignHorizontal).toBe('center');
    expect(clone.alignVertical).toBe('bottom');
  });

  it('leaves absent align props absent on the clone (defaults stay canonical)', () => {
    const base = noteMetrics('Risk');
    const note = {
      id: 'note_risk',
      eventStormingType: 'note',
      eventStormingLabel: 'Risk',
      x: 100,
      y: 100,
      width: base.width,
      height: base.height,
    };
    const { copyPaste, created } = harness([note]);

    expect(copyPaste.duplicate()).toBe(true);

    const clone = created[0]![0]!;
    expect('alignHorizontal' in clone).toBe(false);
    expect('alignVertical' in clone).toBe(false);
  });
});

describe('EventStormingCopyPaste: attachments (pinning)', () => {
  function pinnedSelection() {
    const host = {
      id: 'cmd_place_order',
      eventStormingType: 'command',
      eventStormingLabel: 'Place Order',
      x: 200,
      y: 300,
      width: STICKY_STYLES.command.width,
      height: STICKY_STYLES.command.height,
    };
    const attacher = {
      id: 'actor_customer',
      eventStormingType: 'actor',
      eventStormingLabel: 'Customer',
      x: 210,
      y: 290,
      width: STICKY_STYLES.actor.width,
      height: STICKY_STYLES.actor.height,
      host,
    };
    return { host, attacher };
  }

  it('keeps the attachment when host and attacher are copied together (one insert command)', () => {
    const { host, attacher } = pinnedSelection();
    const { copyPaste, created } = harness([host, attacher]);

    expect(copyPaste.duplicate()).toBe(true);

    expect(created).toHaveLength(1);
    const [hostClone, attacherClone] = created[0]! as [CreatedShape, CreatedShape];
    expect(attacherClone.eventStormingType).toBe('actor');
    // Pinned to the CLONE host — not to the original.
    expect(attacherClone.host).toBe(hostClone);
    expect(attacherClone.host).not.toBe(host);
  });

  it('pastes a lone attacher detached (host not part of the copy)', () => {
    const { host, attacher } = pinnedSelection();
    // Sanity contrast: copied together the clone IS pinned…
    const together = harness([host, attacher]);
    together.copyPaste.duplicate();
    expect(together.created[0]![1]!.host).toBeDefined();

    // …copied alone it is not.
    const { copyPaste, created } = harness([attacher]);
    expect(copyPaste.duplicate()).toBe(true);
    expect(created[0]![0]!.host).toBeUndefined();
  });

  function pinnedNoteSelection() {
    const host = {
      id: 'cmd_place_order',
      eventStormingType: 'command',
      eventStormingLabel: 'Place Order',
      x: 200,
      y: 300,
      width: STICKY_STYLES.command.width,
      height: STICKY_STYLES.command.height,
    };
    const note = {
      id: 'note_check',
      eventStormingType: 'note',
      eventStormingLabel: 'Check credit limit',
      x: 210,
      y: 240,
      width: 240,
      height: 160,
      host,
    };
    return { host, note };
  }

  it('keeps a pinned note attached to the CLONE host when copied together, incl. its manual box', () => {
    const { host, note } = pinnedNoteSelection();
    const { copyPaste, created } = harness([host, note]);

    expect(copyPaste.duplicate()).toBe(true);

    const [hostClone, noteClone] = created[0]! as [CreatedShape, CreatedShape];
    expect(noteClone.eventStormingType).toBe('note');
    // Pinned to the CLONE host — not to the original.
    expect(noteClone.host).toBe(hostClone);
    expect(noteClone.host).not.toBe(host);
    // The manually resized box (resize feature) travels with the clone.
    expect(noteClone.width).toBe(240);
    expect(noteClone.height).toBe(160);
  });

  it('pastes a lone attached note detached, keeping its manual box', () => {
    const { note } = pinnedNoteSelection();
    const { copyPaste, created } = harness([note]);

    expect(copyPaste.duplicate()).toBe(true);

    const clone = created[0]![0]!;
    expect(clone.host).toBeUndefined();
    expect(clone.width).toBe(240);
    expect(clone.height).toBe(160);
  });
});
