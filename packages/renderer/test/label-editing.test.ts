// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import { serializeDSL, parseDSLWithDiagnostics } from '@miragon/event-storming-dsl';
import type { EventStormingBoard } from '@miragon/event-storming-schema-model';
import EventStormingLabelEditing, {
  sanitizeLabel,
} from '../src/label-editing/EventStormingLabelEditing.js';
import type EventStormingModeling from '../src/modeling/EventStormingModeling.js';
import type { EventStormingConnection, EventStormingShape } from '../src/model/di-types.js';

describe('sanitizeLabel: DSL metacharacter defusing', () => {
  it('defuses arrows, semicolons and coordinate brackets', () => {
    expect(sanitizeLabel('retry [3, 5]')).toBe('retry (3, 5)');
    expect(sanitizeLabel('A -> B; fast')).toBe('A → B, fast');
  });

  it('defuses comment starters exactly like the DSL serializer escapeText (WYSIWYG round-trip)', () => {
    expect(sanitizeLabel('Save //TODO check')).toBe('Save ∕∕TODO check');
    expect(sanitizeLabel('a /* b')).toBe('a ∕* b');
    expect(sanitizeLabel('a //// b')).not.toContain('//');
  });

  it('keeps URLs intact (:// is a scheme separator, not a comment — like the DSL lexer)', () => {
    expect(sanitizeLabel('see https://example.com')).toBe('see https://example.com');
  });

  it('keeps newlines (the DSL escapes them for stickies and notes)', () => {
    expect(sanitizeLabel('Order\nPlaced')).toBe('Order\nPlaced');
  });
});

/** Minimal DI mocks — the editor only touches canvas geometry and modeling. */
function editingHarness() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const canvas = {
    getContainer: () => container,
    zoom: () => 1,
    viewbox: () => ({ x: 0, y: 0 }),
  } as unknown as Canvas;
  const eventBus = { on: () => {} } as unknown as EventBus;
  const calls: { updateLabel: unknown[][]; updateProperties: unknown[][] } = {
    updateLabel: [],
    updateProperties: [],
  };
  const modeling = {
    updateLabel: (...args: unknown[]) => calls.updateLabel.push(args),
    updateProperties: (...args: unknown[]) => calls.updateProperties.push(args),
  } as unknown as EventStormingModeling;
  const editing = new EventStormingLabelEditing(eventBus, canvas, modeling);
  return { container, editing, calls };
}

describe('EventStormingLabelEditing', () => {
  let harness: ReturnType<typeof editingHarness>;

  beforeEach(() => {
    harness = editingHarness();
  });

  afterEach(() => {
    harness.editing.cancel();
    harness.container.remove();
  });

  it('sanitizes connection labels like sticky labels (brackets would eat the arrow line)', () => {
    const conn = {
      eventStormingType: 'arrow',
      waypoints: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    } as unknown as EventStormingConnection;
    harness.editing.activateConnection(conn);

    const field = harness.container.querySelector('input')!;
    field.value = 'retry [3, 5]';
    field.dispatchEvent(new Event('blur'));

    expect(harness.calls.updateProperties).toEqual([[conn, { linkLabel: 'retry (3, 5)' }]]);
  });

  it('a sanitized connection label round-trips through the DSL without losing the edge', () => {
    const board = {
      schemaVersion: '1.0',
      config: { title: 'Fixture' },
      elements: [
        {
          id: 'cmd_command_center',
          elementType: 'command',
          label: 'Command Center',
          position: { x: 100, y: 100 },
        },
        {
          id: 'event_shipped',
          elementType: 'event',
          label: 'Shipped',
          position: { x: 400, y: 100 },
        },
      ],
      edges: [
        {
          id: 'arrow_1',
          edgeType: 'arrow',
          from: 'cmd_command_center',
          to: 'event_shipped',
          label: sanitizeLabel('retry [3, 5]'),
        },
      ],
    } as unknown as EventStormingBoard;

    const { board: reparsed, diagnostics } = parseDSLWithDiagnostics(serializeDSL(board));
    expect(diagnostics).toEqual([]);
    expect(reparsed.elements).toHaveLength(2);
    expect(reparsed.edges).toHaveLength(1);
    expect(reparsed.edges[0]!.label).toBe('retry (3, 5)');
  });

  it('a sanitized multi-line sticky label survives the DSL round-trip verbatim, arrow intact', () => {
    const label = sanitizeLabel('Order\nPlaced //v2');
    expect(label).toBe('Order\nPlaced ∕∕v2');

    const board = {
      schemaVersion: '1.0',
      config: { title: 'Fixture' },
      elements: [
        {
          id: 'event_order_placed',
          elementType: 'event',
          label,
          position: { x: 620, y: 300 },
        },
        {
          id: 'policy_ship_it',
          elementType: 'policy',
          label: 'Ship it',
          position: { x: 800, y: 300 },
        },
      ],
      edges: [
        { id: 'arrow_1', edgeType: 'arrow', from: 'event_order_placed', to: 'policy_ship_it' },
      ],
    } as unknown as EventStormingBoard;

    const out = serializeDSL(board);
    const { board: reparsed, diagnostics } = parseDSLWithDiagnostics(out);
    expect(diagnostics).toEqual([]);
    expect(reparsed.elements.map((el) => el.label)).toEqual([label, 'Ship it']);
    expect(reparsed.edges).toHaveLength(1);
    expect(serializeDSL(reparsed)).toBe(out);
  });

  it('renaming a sticky to an EXISTING label commits it verbatim (duplicates are legal)', () => {
    // Duplicate labels are legal — the DSL disambiguates via `(id …)`/`#id` — so the editor
    // commits the typed value as-is: no uniqueness lookup, no silent "Order 2" suffixing.
    const element = {
      id: 'agg_2',
      eventStormingType: 'aggregate',
      eventStormingLabel: 'Shipment',
      x: 100,
      y: 100,
      width: 130,
      height: 90,
    } as unknown as EventStormingShape;
    harness.editing.activate(element);

    const field = harness.container.querySelector('textarea')!;
    field.value = 'Order';
    field.dispatchEvent(new Event('blur'));

    expect(harness.calls.updateLabel).toEqual([[element, 'Order']]);
  });

  it('opens the sticky editor centered OVER the sticky, sized to its footprint', () => {
    const element = {
      eventStormingType: 'command',
      eventStormingLabel: 'Place Order',
      x: 100,
      y: 100,
      width: 130,
      height: 90,
    } as unknown as EventStormingShape;
    harness.editing.activate(element);

    const field = harness.container.querySelector('textarea')!;
    expect(field.style.left).toBe('165px');
    expect(field.style.top).toBe('145px');
    expect(field.style.transform).toBe('translate(-50%, -50%)');
    expect(field.style.width).toBe('130px');
  });
});

describe('EventStormingLabelEditing: an import while the editor is open', () => {
  function importHarness(options: { readOnly?: boolean } = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const canvas = {
      getContainer: () => container,
      zoom: () => 1,
      viewbox: () => ({ x: 0, y: 0 }),
    } as unknown as Canvas;
    const listeners = new Map<string, Array<(event: unknown) => void>>();
    const eventBus = {
      on: (names: string | string[], listener: (event: unknown) => void) => {
        for (const name of ([] as string[]).concat(names)) {
          listeners.set(name, [...(listeners.get(name) ?? []), listener]);
        }
      },
    } as unknown as EventBus;
    const fire = (name: string, event: unknown = {}) =>
      (listeners.get(name) ?? []).forEach((listener) => listener(event));
    const updateLabel: unknown[][] = [];
    const modeling = {
      updateLabel: (...args: unknown[]) => updateLabel.push(args),
      updateProperties: () => {},
    } as unknown as EventStormingModeling;
    const elements = new Map<string, EventStormingShape>();
    const sticky = (label: string) =>
      ({
        id: 'event_order_placed',
        eventStormingType: 'event',
        eventStormingLabel: label,
        x: 0,
        y: 0,
        width: 130,
        height: 90,
      }) as unknown as EventStormingShape;
    elements.set('event_order_placed', sticky('Order Placed'));
    const editing = new EventStormingLabelEditing(
      eventBus,
      canvas,
      modeling,
      { get: (id: string) => elements.get(id) } as never,
      { isReadOnly: () => options.readOnly ?? false },
    );
    const field = () => container.querySelector('textarea');
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    return { container, editing, elements, sticky, field, fire, settle, updateLabel };
  }

  // Hosts re-import remote states while the user types; a commit on the removed shape would be
  // wiped with the history, and the typed text with it.
  it('takes the editor down without committing and reopens it with the typed text', async () => {
    const { editing, elements, sticky, field, fire, settle, updateLabel, container } =
      importHarness();
    editing.activate(elements.get('event_order_placed')!);
    field()!.value = 'Order Confirmed';
    expect(editing.openEdit()).toEqual({
      elementId: 'event_order_placed',
      value: 'Order Confirmed',
    });

    editing.suspend();
    expect(field()).toBeNull();
    expect(editing.openEdit()).toBeUndefined();
    elements.set('event_order_placed', sticky('Order Placed'));
    fire('canvas.viewbox.changing');
    editing.resumeAfterImport();
    expect(field()).toBeNull();

    await settle();
    expect(field()!.value).toBe('Order Confirmed');
    expect(editing.openEdit()).toEqual({
      elementId: 'event_order_placed',
      value: 'Order Confirmed',
    });
    expect(updateLabel).toEqual([]);
    field()!.dispatchEvent(new Event('blur'));
    expect(updateLabel).toEqual([[elements.get('event_order_placed'), 'Order Confirmed']]);
    container.remove();
  });

  it('drops the edit when the imported board no longer has the element', async () => {
    const { editing, elements, field, settle, updateLabel, container } = importHarness();
    editing.activate(elements.get('event_order_placed')!);
    field()!.value = 'Order Confirmed';
    editing.suspend();
    elements.clear();
    editing.resumeAfterImport();
    await settle();
    expect(field()).toBeNull();
    expect(updateLabel).toEqual([]);
    container.remove();
  });

  it('opens no editor under the read-only lock', () => {
    const { editing, elements, field, container } = importHarness({ readOnly: true });
    editing.activate(elements.get('event_order_placed')!);
    expect(field()).toBeNull();
    container.remove();
  });

  it('closes an open editor without committing when the lock engages', () => {
    const { editing, elements, field, fire, updateLabel, container } = importHarness();
    editing.activate(elements.get('event_order_placed')!);
    field()!.value = 'Order Confirmed';
    fire('eventStorming.readOnly.changed', { readOnly: true });
    expect(field()).toBeNull();
    expect(updateLabel).toEqual([]);
    container.remove();
  });
});

describe('EventStormingLabelEditing: a view change while the editor is open', () => {
  // Hosts fit and restore their view while the user types (modeler-api L5); a commit there would
  // write half-typed text. The field stays open and follows its element instead.
  function viewHarness() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = { x: 0, y: 0, scale: 1 };
    const canvas = {
      getContainer: () => container,
      zoom: () => view.scale,
      viewbox: () => ({ x: view.x, y: view.y }),
    } as unknown as Canvas;
    const listeners = new Map<string, Array<(event: unknown) => void>>();
    const eventBus = {
      on: (names: string | string[], listener: (event: unknown) => void) => {
        for (const name of ([] as string[]).concat(names)) {
          listeners.set(name, [...(listeners.get(name) ?? []), listener]);
        }
      },
    } as unknown as EventBus;
    const changeView = (next: { x: number; y: number; scale: number }) => {
      for (const listener of listeners.get('canvas.viewbox.changing') ?? []) listener({});
      Object.assign(view, next);
      for (const listener of listeners.get('canvas.viewbox.changed') ?? []) listener({});
    };
    const fire = (name: string) => (listeners.get(name) ?? []).forEach((listener) => listener({}));
    const calls: { updateLabel: unknown[][]; updateProperties: unknown[][] } = {
      updateLabel: [],
      updateProperties: [],
    };
    const modeling = {
      updateLabel: (...args: unknown[]) => calls.updateLabel.push(args),
      updateProperties: (...args: unknown[]) => calls.updateProperties.push(args),
    } as unknown as EventStormingModeling;
    const editing = new EventStormingLabelEditing(eventBus, canvas, modeling);
    return { container, editing, calls, changeView, fire };
  }

  const sticky = {
    id: 'event_order_placed',
    eventStormingType: 'event',
    eventStormingLabel: 'Order Placed',
    x: 100,
    y: 50,
    width: 130,
    height: 90,
  } as unknown as EventStormingShape;

  let harness: ReturnType<typeof viewHarness>;

  beforeEach(() => {
    harness = viewHarness();
  });

  afterEach(() => {
    harness.editing.cancel();
    harness.container.remove();
  });

  it('keeps a sticky editor open with its typed text and moves it with the view', () => {
    harness.editing.activate(sticky);
    const field = harness.container.querySelector('textarea')!;
    field.value = 'Order Confirmed';
    expect([field.style.left, field.style.top, field.style.width]).toEqual([
      '165px',
      '95px',
      '130px',
    ]);

    harness.changeView({ x: 40, y: -20, scale: 2 });

    expect(harness.calls.updateLabel).toEqual([]);
    expect(harness.editing.openEdit()).toEqual({
      elementId: 'event_order_placed',
      value: 'Order Confirmed',
    });
    expect(harness.container.querySelector('textarea')).toBe(field);
    expect([field.style.left, field.style.top, field.style.width]).toEqual([
      '250px',
      '230px',
      '260px',
    ]);

    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    expect(harness.calls.updateLabel).toEqual([[sticky, 'Order Confirmed']]);
  });

  it('keeps an arrow label editor open and moves it with the view', () => {
    const conn = {
      id: 'arrow_1',
      eventStormingType: 'arrow',
      waypoints: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
    } as unknown as EventStormingConnection;
    harness.editing.activateConnection(conn);
    const field = harness.container.querySelector('input')!;
    field.value = 'on retry';

    harness.changeView({ x: 10, y: 10, scale: 0.5 });

    expect(harness.calls.updateProperties).toEqual([]);
    expect(harness.editing.openEdit()).toEqual({ elementId: 'arrow_1', value: 'on retry' });
    expect([field.style.left, field.style.top]).toEqual(['15px', '-18px']);
  });

  it('still commits on a click or a drag on the canvas', () => {
    harness.editing.activate(sticky);
    harness.container.querySelector('textarea')!.value = 'Order Confirmed';
    harness.fire('element.mousedown');
    expect(harness.calls.updateLabel).toEqual([[sticky, 'Order Confirmed']]);

    harness.editing.activate(sticky);
    harness.container.querySelector('textarea')!.value = 'Order Shipped';
    harness.fire('drag.init');
    expect(harness.calls.updateLabel).toEqual([
      [sticky, 'Order Confirmed'],
      [sticky, 'Order Shipped'],
    ]);
  });
});
