import { describe, it, expect } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import CommandStack from 'diagram-js/lib/command/CommandStack';
import UpdateAttachmentHandler from 'diagram-js/lib/features/modeling/cmd/UpdateAttachmentHandler';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Shape } from 'diagram-js/lib/model/Types';
import type { Injector } from 'didi';
import type { EventStormingBoard } from '@miragon/event-storming-schema-model';
import EventStormingImporter from '../src/io/EventStormingImporter.js';
import EventStormingExporter from '../src/io/EventStormingExporter.js';
import EventStormingElementFactory from '../src/model/EventStormingElementFactory.js';
import EventStormingModeling from '../src/modeling/EventStormingModeling.js';
import EventStormingAttachBehavior from '../src/attach/EventStormingAttachBehavior.js';
import type BoardBounds from '../src/board-bounds/BoardBounds.js';
import type { EventStormingShape } from '../src/model/di-types.js';
import { STICKY_STYLES } from '../src/draw/styles.js';
import { ROOT_ID } from '../src/io/types.js';

/** Importer + exporter over the same shape store — the mock factory returns plain attrs. */
function ioHarness() {
  const shapes: EventStormingShape[] = [];
  let root: Record<string, unknown> | undefined;
  const rawFactory = {
    createShape: (attrs: Record<string, unknown>) => attrs,
    createConnection: (attrs: Record<string, unknown>) => attrs,
    createRoot: (attrs: Record<string, unknown>) => attrs,
  } as unknown as ElementFactory;
  const canvas = {
    getRootElement: () => {
      if (!root) throw new Error('no root yet');
      return root;
    },
    setRootElement: (r: Record<string, unknown>) => (root = r),
    addShape: (shape: EventStormingShape) => shapes.push(shape),
    addConnection: () => {},
    viewbox: () => {},
  } as unknown as Canvas;
  const importer = new EventStormingImporter(
    canvas,
    rawFactory,
    new EventStormingElementFactory(rawFactory, { getAll: () => [] } as unknown as ElementRegistry),
    { contentBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }) } as unknown as BoardBounds,
    { fire: () => {} } as unknown as EventBus,
    { getAll: () => [] } as unknown as ElementRegistry,
  );
  const exporter = new EventStormingExporter(
    { getAll: () => shapes } as unknown as ElementRegistry,
    canvas,
  );
  const byId = (id: string) => shapes.find((s) => s.id === id);
  return { importer, exporter, byId };
}

describe('Attachments: import -> export round-trip', () => {
  it('wires host from attachedTo after ALL shapes exist and exports it back', () => {
    const board = {
      config: { title: 'Fixture' },
      elements: [
        // The attacher comes FIRST in document order — its host only exists afterwards.
        {
          id: 'actor_customer',
          elementType: 'actor',
          label: 'Customer',
          position: { x: 210, y: 190 },
          attachedTo: 'command_place_order',
        },
        {
          id: 'command_place_order',
          elementType: 'command',
          label: 'Place Order',
          position: { x: 200, y: 200 },
        },
      ],
      edges: [],
    } as unknown as EventStormingBoard;

    const { importer, exporter, byId } = ioHarness();
    expect(importer.import(board)).toEqual([]);
    expect(byId('actor_customer')!.host).toBe(byId('command_place_order'));

    const exported = exporter.export();
    const actor = exported.elements.find((e) => e.id === 'actor_customer');
    if (actor?.elementType !== 'actor') throw new Error('actor missing');
    expect(actor.attachedTo).toBe('command_place_order');
    // The position stays the actor's own absolute center — attachedTo never changes geometry.
    expect(actor.position).toEqual({ x: 210, y: 190 });
    const command = exported.elements.find((e) => e.id === 'command_place_order')!;
    expect('attachedTo' in command).toBe(false);
  });

  it('warns (instead of crashing) on a missing or non-host attachedTo target', () => {
    const board = {
      config: { title: 'Fixture' },
      elements: [
        {
          id: 'hotspot_why',
          elementType: 'hotspot',
          label: 'Why?',
          position: { x: 0, y: 0 },
          attachedTo: 'ghost',
        },
        {
          id: 'actor_customer',
          elementType: 'actor',
          label: 'Customer',
          position: { x: 50, y: 0 },
          attachedTo: 'note_hint',
        },
        { id: 'note_hint', elementType: 'note', label: 'Hint', position: { x: 100, y: 0 } },
      ],
      edges: [],
    } as unknown as EventStormingBoard;

    const { importer, byId } = ioHarness();
    const warnings = importer.import(board);
    expect(warnings.map((w) => w.elementId)).toEqual(['hotspot_why', 'actor_customer']);
    expect(warnings[0]!.message).toContain('attachedTo');
    expect(byId('hotspot_why')!.host).toBeUndefined();
    expect(byId('actor_customer')!.host).toBeUndefined();
  });
});

/** Real EventBus + CommandStack, so nested commands provably join ONE undo step. */
function retypeHarness() {
  const eventBus = new EventBus();
  const commandStack = new CommandStack(eventBus, {
    instantiate: (Type: new () => unknown) => new Type(),
  } as unknown as Injector);
  const modeling = new EventStormingModeling(
    commandStack,
    { getRootElement: () => ({ id: ROOT_ID }) } as unknown as Canvas,
    { get: () => undefined } as unknown as ElementRegistry,
  );
  commandStack.registerHandler('element.updateAttachment', UpdateAttachmentHandler);
  new EventStormingAttachBehavior(eventBus, {
    updateAttachment: (shape: Shape, newHost?: Shape) =>
      commandStack.execute('element.updateAttachment', { shape, newHost }),
  } as unknown as Modeling);
  return { commandStack, modeling };
}

function pinnedPair() {
  const host = {
    id: 'command_place_order',
    eventStormingType: 'command',
    eventStormingLabel: 'Place Order',
    x: 0,
    y: 0,
    width: STICKY_STYLES.command.width,
    height: STICKY_STYLES.command.height,
    attachers: [] as unknown[],
  };
  const attacher = {
    id: 'actor_customer',
    eventStormingType: 'actor',
    eventStormingLabel: 'Customer',
    x: 10,
    y: 10,
    width: STICKY_STYLES.actor.width,
    height: STICKY_STYLES.actor.height,
    host,
  };
  host.attachers.push(attacher);
  return {
    host: host as unknown as EventStormingShape,
    attacher: attacher as unknown as EventStormingShape,
  };
}

describe('EventStormingAttachBehavior: retype keeps pinning consistent', () => {
  it('detaches a pinned actor retyped to a non-attachable kind — one undo restores both', () => {
    const { commandStack, modeling } = retypeHarness();
    const { host, attacher } = pinnedPair();

    modeling.setStickyKind(attacher, 'event');
    expect(attacher.eventStormingType).toBe('event');
    expect(attacher.host).toBeUndefined();
    expect(host.attachers).toEqual([]);

    commandStack.undo();
    expect(attacher.eventStormingType).toBe('actor');
    expect(attacher.host).toBe(host);
    expect(host.attachers).toContain(attacher);
  });

  it('sheds the attachers of a host retyped to a non-host kind, keeps them on host-to-host', () => {
    const { commandStack, modeling } = retypeHarness();
    const { host, attacher } = pinnedPair();

    modeling.setStickyKind(host, 'event');
    expect(attacher.host).toBe(host);

    modeling.setStickyKind(host, 'hotspot');
    expect(attacher.host).toBeUndefined();
    expect(host.attachers).toEqual([]);

    commandStack.undo();
    expect(attacher.host).toBe(host);
    expect(host.attachers).toContain(attacher);
  });

  it('leaves retypes between attachable kinds attached', () => {
    const { modeling } = retypeHarness();
    const { host, attacher } = pinnedPair();
    modeling.setStickyKind(attacher, 'hotspot');
    expect(attacher.host).toBe(host);
  });
});
