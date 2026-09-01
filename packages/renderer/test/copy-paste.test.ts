import { describe, it, expect } from 'vitest';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type Create from 'diagram-js/lib/features/create/Create';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Mouse from 'diagram-js/lib/features/mouse/Mouse';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import EventStormingCopyPaste from '../src/modeling/EventStormingCopyPaste.js';
import { STICKY_STYLES, noteMetrics } from '../src/draw/styles.js';

interface CreatedShape {
  eventStormingType: string;
  eventStormingLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  host?: CreatedShape;
}

function harness(selected: Array<Record<string, unknown>>) {
  const created: CreatedShape[][] = [];
  const copyPaste = new EventStormingCopyPaste(
    { get: () => selected, select: () => {} } as unknown as Selection,
    {
      createElements: (elements: CreatedShape[]) => {
        created.push(elements);
        return elements;
      },
    } as unknown as Modeling,
    {
      createShape: (attrs: Record<string, unknown>) => attrs,
      createConnection: (attrs: Record<string, unknown>) => attrs,
    } as unknown as ElementFactory,
    { getAll: () => selected } as unknown as ElementRegistry,
    { getRootElement: () => ({ id: 'event-storming-root' }) } as unknown as Canvas,
    {} as unknown as Create,
    { getLastMoveEvent: () => null } as unknown as Mouse,
  );
  return { copyPaste, created };
}

describe('EventStormingCopyPaste: pasted note auto-size', () => {
  // Regression: a pasted note kept the snapshot box sized for the OLD label, so the unique
  // " 2" suffix was clipped invisible on canvas and the geometry changed on reload.
  it('recomputes the note box from the suffixed label, keeping the center', () => {
    const base = noteMetrics('Risk');
    const note = {
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
    const expected = noteMetrics('Risk 2');
    expect(clone.eventStormingLabel).toBe('Risk 2');
    expect(clone.width).toBe(expected.width);
    expect(clone.height).toBe(expected.height);
    expect(clone.x + clone.width / 2).toBe(note.x + note.width / 2);
    expect(clone.y + clone.height / 2).toBe(note.y + note.height / 2);
  });

  it('keeps a MANUALLY sized box on the clone (only auto boxes track the suffixed label)', () => {
    const note = {
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
    expect(clone.eventStormingLabel).toBe('Risk 2');
    expect(clone.width).toBe(240);
    expect(clone.height).toBe(160);
    expect(clone.x).toBe(note.x);
    expect(clone.y).toBe(note.y);
  });

  it('keeps the snapshot size for fixed-size stickies', () => {
    const sticky = {
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
    expect(clone.eventStormingLabel).toBe('Order Placed 2');
    expect(clone.width).toBe(STICKY_STYLES.event.width);
    expect(clone.height).toBe(STICKY_STYLES.event.height);
    expect(clone.x).toBe(sticky.x);
    expect(clone.y).toBe(sticky.y);
  });
});

describe('EventStormingCopyPaste: attachments (pinning)', () => {
  function pinnedSelection() {
    const host = {
      eventStormingType: 'command',
      eventStormingLabel: 'Place Order',
      x: 200,
      y: 300,
      width: STICKY_STYLES.command.width,
      height: STICKY_STYLES.command.height,
    };
    const attacher = {
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
});
