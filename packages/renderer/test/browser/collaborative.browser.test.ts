import { afterEach, describe, expect, it } from 'vitest';
import { attachedHost } from '@miragon/modeler-api/conformance';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Shape } from 'diagram-js/lib/model/Types';
import { parseDSL } from '@miragon/event-storming-dsl';
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeEventStormingModeler,
} from '../../src/index.js';
import type EventStormingElementFactory from '../../src/model/EventStormingElementFactory.js';
import type EventStormingLabelEditing from '../../src/label-editing/EventStormingLabelEditing.js';
import type EventStormingModeling from '../../src/modeling/EventStormingModeling.js';
import type { EventStormingShape } from '../../src/model/di-types.js';
import { STICKY_STYLES } from '../../src/draw/styles.js';
import orderCheckout from './fixtures/order-checkout.storm?raw';
import warehouseBigPicture from './fixtures/warehouse-big-picture.storm?raw';

const mounted: CollaborativeEventStormingModeler[] = [];
const wrappers: HTMLElement[] = [];

afterEach(() => {
  for (const modeler of mounted.splice(0)) modeler.destroy();
  for (const wrapper of wrappers.splice(0)) wrapper.remove();
});

function mount(modeler: CollaborativeEventStormingModeler): CollaborativeEventStormingModeler {
  const host = attachedHost();
  if (host.parentElement) wrappers.push(host.parentElement);
  modeler.attachTo(host);
  mounted.push(modeler);
  return modeler;
}

const editor = () => mount(createCollaborativeModeler());
const viewer = () => mount(createCollaborativeViewer());

function addDomainEvent(modeler: CollaborativeEventStormingModeler): EventStormingShape {
  const factory = modeler.diagram.get<EventStormingElementFactory>('eventStormingElementFactory');
  const sticky = factory.createNew('event', STICKY_STYLES.event.label);
  modeler.diagram
    .get<Modeling>('modeling')
    .createShape(
      sticky,
      { x: 1240, y: 700 },
      modeler.diagram.get<Canvas>('canvas').getRootElement() as Shape,
    );
  return sticky;
}

const ids = (modeler: CollaborativeEventStormingModeler) =>
  modeler.elements
    .list()
    .map((element) => element.id)
    .sort();

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('before the first import', () => {
  // Asking the canvas for its root creates an implicit one; removing that as a shape used to
  // corrupt the canvas, and every later import rejected.
  it.each([
    ['an export', (modeler: CollaborativeEventStormingModeler) => void modeler.exportText()],
    [
      'a user command',
      (modeler: CollaborativeEventStormingModeler) => void addDomainEvent(modeler),
    ],
    [
      'a level change',
      (modeler: CollaborativeEventStormingModeler) =>
        modeler.diagram.get<EventStormingModeling>('eventStormingModeling').setLevel('process'),
    ],
  ])('the editor still imports after %s, and again after that', async (_name, touch) => {
    const modeler = editor();
    touch(modeler);
    await expect(modeler.importText(orderCheckout)).resolves.toBeDefined();
    expect(modeler.exportText()).toBe(orderCheckout);
    await expect(modeler.importText(warehouseBigPicture)).resolves.toBeDefined();
    expect(modeler.exportText()).toBe(warehouseBigPicture);
    expect(modeler.diagram.get<Canvas>('canvas').getRootElements()).toHaveLength(1);
  });

  it('the viewer still imports after an export', async () => {
    const modeler = viewer();
    modeler.exportText();
    await expect(modeler.importText(orderCheckout)).resolves.toBeDefined();
    expect(modeler.exportText()).toBe(orderCheckout);
  });
});

describe('texts that used to reject after the previous board was cleared', () => {
  it.each(['event-storming-root', '__implicitroot_0'])(
    'a sticky declared as (id %s) gets a fresh id and the board imports',
    async (reserved) => {
      const modeler = editor();
      modeler.exportText();
      await modeler.importText(orderCheckout);
      const { warnings } = await modeler.importText(
        `title Broken\nevent Foo [0, 0] (id ${reserved})\nevent Bar [200, 0]\n`,
      );
      expect(warnings.join('\n')).toMatch(/reserved for the board itself/);
      expect(ids(modeler)).toEqual(['event_bar', 'event_foo']);
      expect(modeler.diagram.get<CommandStack>('commandStack').canUndo()).toBe(false);
    },
  );

  // A board from JSON bypasses the DSL: the renderer refuses it before touching the canvas (L7).
  it('a board with a reserved id rejects without a trace', async () => {
    const modeler = editor();
    await modeler.importText(orderCheckout);
    addDomainEvent(modeler);
    const before = modeler.exportText();
    const board = parseDSL('title T\nevent Foo [0, 0]\n');
    const reserved = {
      ...board,
      elements: board.elements.map((element) => ({ ...element, id: 'event-storming-root' })),
    };
    await expect(modeler.diagram.importMap(reserved)).rejects.toThrow(/reserved/);
    expect(modeler.exportText()).toBe(before);
    expect(modeler.diagram.get<CommandStack>('commandStack').canUndo()).toBe(true);
  });

  it('a number that overflows to Infinity stays in the text as an unread line', async () => {
    const modeler = editor();
    const line = `event Big [${'9'.repeat(400)}, 0]`;
    const { warnings } = await modeler.importText(`title T\n${line}\nevent Ok [0, 0]\n`);
    expect(warnings).toHaveLength(1);
    expect(ids(modeler)).toEqual(['event_ok']);
    expect(modeler.exportText()).toContain(`${line}\n`);
  });
});

describe('the elements surface', () => {
  it('lists only stickies: notes, drawings and arrows have no id the text keeps', async () => {
    const modeler = editor();
    await modeler.importText(orderCheckout);
    const registry = modeler.diagram.get<ElementRegistry>('elementRegistry');
    expect(ids(modeler)).toEqual([
      'actor_customer',
      'agg_order',
      'cmd_place_order',
      'event_order_placed',
      'ext_payment_provider',
      'hot_double_payment_on_retry',
      'policy_when_order_placed_reserve_stock',
      'read_order_summary',
    ]);
    for (const id of ['note_checkout_flow_n_reviewed_with_the_team', 'draw_line', 'arrow_1']) {
      if (!registry.get(id)) continue;
      expect(modeler.elements.reveal(id)).toBe(false);
    }
    expect(modeler.elements.reveal('event_order_placed')).toBe(true);
  });

  // Hosts anchor todos, presence and deep links to these ids: a peer that imports the export,
  // or a reload, must find every id of the session under the same name.
  it('keeps every sticky id through an export and a re-import elsewhere', async () => {
    const modeler = editor();
    await modeler.importText(orderCheckout);
    const created = addDomainEvent(modeler);
    const registry = modeler.diagram.get<ElementRegistry>('elementRegistry');
    modeler.diagram
      .get<EventStormingModeling>('eventStormingModeling')
      .updateLabel(registry.get('event_order_placed') as EventStormingShape, 'Order Confirmed');

    const peer = viewer();
    await peer.importText(modeler.exportText());
    expect(peer.elements.list()).toEqual(modeler.elements.list());
    expect(peer.elements.list()).toContainEqual({ id: created.id, name: 'Domain Event' });
    expect(peer.elements.list()).toContainEqual({
      id: 'event_order_placed',
      name: 'Order Confirmed',
    });
    expect(peer.exportText()).toBe(modeler.exportText());
  });
});

describe('a remote import while the user types a label', () => {
  it('reopens the label editor with the typed text on the same element', async () => {
    const modeler = editor();
    await modeler.importText(orderCheckout);
    const registry = modeler.diagram.get<ElementRegistry>('elementRegistry');
    const labelEditing = modeler.diagram.get<EventStormingLabelEditing>(
      'eventStormingLabelEditing',
    );
    labelEditing.activate(registry.get('event_order_placed') as EventStormingShape);
    const field = () =>
      document.querySelector<HTMLTextAreaElement>('textarea.event-storming-label-textarea');
    field()!.value = 'Order Confirmed';
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));

    const remote = orderCheckout.replace(
      'readmodel Order Summary [660, 120]',
      'readmodel Order Summary [700, 120]',
    );
    const view = modeler.getViewState();
    await modeler.importText(remote);
    modeler.setViewState(view);
    await settle();

    expect(field()?.value).toBe('Order Confirmed');
    expect(changes).toBe(0);
    field()!.blur();
    expect(changes).toBe(1);
    expect(modeler.exportText()).toContain('event Order Confirmed [660, 320]');
    expect(modeler.exportText()).toContain('readmodel Order Summary [700, 120]');
  });
});

describe('the view after an import (guide §5.9)', () => {
  it('never zooms above 100%, and shows an empty board at 100%', async () => {
    const modeler = editor();
    const canvas = modeler.diagram.get<Canvas>('canvas');
    await modeler.importText('title Small\nevent Only [0, 0]\n');
    expect(canvas.zoom()).toBeCloseTo(1, 5);
    await modeler.importText('title Empty\n');
    expect(canvas.zoom()).toBeCloseTo(1, 5);
    await modeler.importText(orderCheckout);
    expect(canvas.zoom()).toBeLessThanOrEqual(1);
  });

  it('centres the content', async () => {
    const modeler = editor();
    await modeler.importText('title Small\nevent Only [0, 0]\n');
    const { x, y, width, height } = modeler.diagram.get<Canvas>('canvas').viewbox();
    expect(x + width / 2).toBeCloseTo(0, 5);
    expect(y + height / 2).toBeCloseTo(0, 5);
  });
});
