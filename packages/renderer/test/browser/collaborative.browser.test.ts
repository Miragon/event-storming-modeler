import { afterEach, describe, expect, it } from 'vitest';
import { attachedHost } from '@miragon/modeler-api/conformance';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type ContextPad from 'diagram-js/lib/features/context-pad/ContextPad';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Rules from 'diagram-js/lib/features/rules/Rules';
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
import type EventStormingReadOnly from '../../src/read-only/EventStormingReadOnly.js';
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
      expect(warnings.join('\n')).toMatch(/belongs to the board itself/);
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

  it.each([
    ['overflows to Infinity', '9'.repeat(400)],
    ['lies beyond what SVG can draw', '9'.repeat(39)],
  ])('a number that %s stays in the text as an unread line', async (_, number) => {
    const modeler = editor();
    const line = `event Big [${number}, 0]`;
    const { warnings } = await modeler.importText(`title T\n${line}\nevent Ok [0, 0]\n`);
    expect(warnings).toEqual([
      `Line 2: Couldn't read this line. It stays in the file unchanged. (“${line}”)`,
    ]);
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
      expect(modeler.elements.bounds(id)).toBeUndefined();
    }
    expect(modeler.elements.reveal('event_order_placed')).toBe(true);
  });

  // Hosts outline a peer's selection and place todo markers with it, so it is the sticky's box on
  // the board (centre [660, 320]), whatever the zoom.
  it('gives a sticky its box in board coordinates, live through a move and a zoom', async () => {
    const modeler = editor();
    await modeler.importText(orderCheckout);
    const { width, height } = STICKY_STYLES.event;
    expect(modeler.elements.bounds('event_order_placed')).toEqual({
      x: 660 - width / 2,
      y: 320 - height / 2,
      width,
      height,
    });
    const sticky = modeler.diagram
      .get<ElementRegistry>('elementRegistry')
      .get('event_order_placed') as Shape;
    modeler.diagram.get<Modeling>('modeling').moveElements([sticky], { x: 40, y: -20 });
    modeler.diagram.get<Canvas>('canvas').zoom(2.5);
    expect(modeler.elements.bounds('event_order_placed')).toEqual({
      x: 700 - width / 2,
      y: 300 - height / 2,
      width,
      height,
    });
  });

  it('gives the viewer the same boxes', async () => {
    const modeler = viewer();
    await modeler.importText(orderCheckout);
    const { width, height } = STICKY_STYLES.event;
    expect(modeler.elements.bounds('event_order_placed')).toEqual({
      x: 660 - width / 2,
      y: 320 - height / 2,
      width,
      height,
    });
    expect(modeler.elements.bounds('event_no_such_sticky')).toBeUndefined();
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

describe("a host's view change while the user types a label (modeler-api L5)", () => {
  it('neither commits nor closes the editor, which stays over its sticky', async () => {
    const modeler = editor();
    await modeler.importText(orderCheckout);
    const canvas = modeler.diagram.get<Canvas>('canvas');
    const sticky = modeler.diagram
      .get<ElementRegistry>('elementRegistry')
      .get('event_order_placed') as EventStormingShape;
    modeler.diagram.get<EventStormingLabelEditing>('eventStormingLabelEditing').activate(sticky);
    const field = () =>
      document.querySelector<HTMLTextAreaElement>('textarea.event-storming-label-textarea');
    const opened = field()!;
    opened.value = 'Order Confirmed';
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));
    const document_ = modeler.exportText();

    modeler.setViewState({ x: 120, y: 80, width: 640, height: 480 });
    canvas.zoom('fit-viewport');
    canvas.scroll({ dx: 37, dy: -21 });
    canvas.zoom(1.5);
    await settle();

    expect(changes).toBe(0);
    expect(modeler.exportText()).toBe(document_);
    expect(field()).toBe(opened);
    expect(opened.value).toBe('Order Confirmed');
    const fieldBox = opened.getBoundingClientRect();
    const stickyBox = canvas.getGraphics(sticky).getBoundingClientRect();
    expect(fieldBox.left + fieldBox.width / 2).toBeCloseTo(stickyBox.left + stickyBox.width / 2, 0);
    expect(fieldBox.top + fieldBox.height / 2).toBeCloseTo(stickyBox.top + stickyBox.height / 2, 0);

    opened.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );
    expect(changes).toBe(1);
    expect(modeler.exportText()).toContain('event Order Confirmed [660, 320]');
  });
});

describe('destroy while the user types a label', () => {
  it('takes the editor down without a commit and leaves no focus call on the destroyed canvas', async () => {
    const modeler = editor();
    await modeler.importText(orderCheckout);
    const registry = modeler.diagram.get<ElementRegistry>('elementRegistry');
    modeler.diagram
      .get<EventStormingLabelEditing>('eventStormingLabelEditing')
      .activate(registry.get('event_order_placed') as EventStormingShape);
    const field = () =>
      document.querySelector<HTMLTextAreaElement>('textarea.event-storming-label-textarea');
    field()!.value = 'typed, not committed';
    let changes = 0;
    modeler.onContentChanged(() => (changes += 1));
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      modeler.destroy();
      await settle();
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
    expect(field()).toBeNull();
    expect(changes).toBe(0);
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

  it.each([
    ['a note too large to show whole', 'note Huge [10, 10] (size 100000000x100000000)'],
    ['stickies too far apart to show together', 'event A [0, 0]\nevent B [5000000, 0]'],
    [
      'stickies at both ends of the drawable range',
      `event A [-1${'0'.repeat(38)}, 0]\nevent B [1${'0'.repeat(38)}, 0]`,
    ],
  ])('keeps a readable view for %s, at the smallest zoom', async (_, lines) => {
    const modeler = editor();
    await modeler.importText(`title Wide\n${lines}\n`);
    const fitted = modeler.getViewState();
    expect(fitted).toBeDefined();
    expect(modeler.diagram.get<Canvas>('canvas').zoom()).toBeCloseTo(0.001, 6);
    await modeler.importText(`title Wide\n${lines}\n`);
    expect(modeler.getViewState()).toEqual(fitted);
  });
});

describe('the modeler-api factory options', () => {
  it('fitOnImport: false keeps the view the host set, on the modeler and on the viewer', async () => {
    for (const modeler of [
      mount(createCollaborativeModeler({ fitOnImport: false })),
      mount(createCollaborativeViewer({ fitOnImport: false })),
    ]) {
      await modeler.importText('title Small\nevent Only [0, 0]\n');
      const view = { x: -2000, y: -1500, width: 800, height: 600 };
      modeler.setViewState(view);
      const set = modeler.getViewState();
      await modeler.importText(orderCheckout);
      expect(modeler.getViewState()).toEqual(set);
    }
  });

  it('fitOnImport defaults to the fit', async () => {
    const modeler = editor();
    modeler.setViewState({ x: -2000, y: -1500, width: 800, height: 600 });
    const moved = modeler.getViewState();
    await modeler.importText(orderCheckout);
    expect(modeler.getViewState()).not.toEqual(moved);
  });

  function keyboardCreateCentre(modeler: CollaborativeEventStormingModeler): {
    x: number;
    y: number;
  } {
    const before = new Set(ids(modeler));
    const entry = modeler.diagram
      .get<Canvas>('canvas')
      .getContainer()
      .querySelector<HTMLElement>('.djs-palette [data-action="create.event"]')!;
    entry.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    const id = ids(modeler).find((candidate) => !before.has(candidate))!;
    const shape = modeler.diagram.get<ElementRegistry>('elementRegistry').get(id) as Shape;
    return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  }

  it('freeArea: { center } places a keyboard-created sticky there', async () => {
    const modeler = mount(
      createCollaborativeModeler({ freeArea: { center: () => ({ x: 300, y: 200 }) } }),
    );
    await modeler.importText('title Empty\n');
    expect(keyboardCreateCentre(modeler)).toEqual({ x: 300, y: 200 });
  });

  it('freeArea: { insets } and the deprecated freeRectInsets place it alike, freeArea first', async () => {
    const insets = () => ({ top: 200, right: 0, bottom: 0, left: 300 });
    const ignored = () => ({ top: 0, right: 300, bottom: 200, left: 0 });
    const centres = [];
    for (const options of [
      { freeArea: { insets } },
      { freeRectInsets: insets },
      { freeArea: { insets }, freeRectInsets: ignored },
    ]) {
      const modeler = mount(createCollaborativeModeler(options));
      await modeler.importText('title Empty\n');
      centres.push(keyboardCreateCentre(modeler));
    }
    expect(centres[1]).toEqual(centres[0]);
    expect(centres[2]).toEqual(centres[0]);
    const plain = mount(createCollaborativeModeler());
    await plain.importText('title Empty\n');
    const centre = keyboardCreateCentre(plain);
    const scale = plain.diagram.get<Canvas>('canvas').zoom();
    expect(centres[0]!.x - centre.x).toBeCloseTo(150 / scale, 5);
    expect(centres[0]!.y - centre.y).toBeCloseTo(100 / scale, 5);
  });
});

describe('the `style dark` directive (guide §10.7)', () => {
  it('survives the round trip and paints nothing', async () => {
    const modeler = editor();
    await modeler.importText('title Night\nstyle dark\nevent A [0, 0]\n');
    expect(modeler.exportText()).toBe('title Night\nstyle dark\nevent A [0, 0]\n');
    const { container } = modeler.diagram;
    expect([...container.classList].filter((name) => /dark|classic/.test(name))).toEqual([]);
    expect(getComputedStyle(container).backgroundColor).toBe('rgb(249, 247, 247)');
  });
});

describe('the read-only lock', () => {
  it('blocks the context pad, moves, resizes, connections and deletes, and lifts again', async () => {
    const modeler = editor();
    await modeler.importText(orderCheckout);
    const diagram = modeler.diagram;
    const registry = diagram.get<ElementRegistry>('elementRegistry');
    const rules = diagram.get<Rules>('rules');
    const contextPad = diagram.get<ContextPad>('contextPad');
    const readOnly = diagram.get<EventStormingReadOnly>('eventStormingReadOnly');
    const event = registry.get('event_order_placed') as Shape;
    const policy = registry.get('policy_when_order_placed_reserve_stock') as Shape;

    readOnly.setReadOnly(true);
    expect(rules.allowed('elements.move', { shapes: [event] })).toBe(false);
    expect(rules.allowed('connection.create', { source: event, target: policy })).toBe(false);
    expect(rules.allowed('elements.delete', { elements: [event] })).toBe(false);
    contextPad.open(event);
    expect(document.querySelectorAll('.djs-context-pad .entry')).toHaveLength(0);

    readOnly.setReadOnly(false);
    expect(rules.allowed('elements.move', { shapes: [event] })).not.toBe(false);
    contextPad.close();
    contextPad.open(event);
    expect(document.querySelectorAll('.djs-context-pad .entry').length).toBeGreaterThan(0);
  });
});
