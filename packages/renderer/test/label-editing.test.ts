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
import type EventStormingElementFactory from '../src/model/EventStormingElementFactory.js';
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

/** Minimal DI mocks — the editor only touches canvas geometry, modeling and uniqueLabel. */
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
  const factory = {
    uniqueLabel: (base: string) => base,
  } as unknown as EventStormingElementFactory;
  const editing = new EventStormingLabelEditing(eventBus, canvas, modeling, factory);
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
