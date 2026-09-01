import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Shape } from 'diagram-js/lib/model/Types';
import { Modeler } from '../../src/index.js';
import type EventStormingModeling from '../../src/modeling/EventStormingModeling.js';
import type EventStormingViewOptions from '../../src/view-options/EventStormingViewOptions.js';
import type EventStormingElementFactory from '../../src/model/EventStormingElementFactory.js';
import { isEventStormingShape, type EventStormingShape } from '../../src/model/di-types.js';
// Pull the real stylesheet in so layout (getBBox) matches production. src/index.ts also imports it.
import '../../src/assets/event-storming.css';

// Minimal board: an actor issuing a command. DSL coords are [x, y] board pixels = element CENTER.
const DSL = `title Integration Fixture
actor Customer [200, 300]
command Place Order [420, 320]
Customer -> Place Order`;

// Pinning: the actor is attached to (moves with) the command via the `(on …)` suffix.
const PINNED_DSL = `title Attachment Fixture
command Place Order [420, 320]
actor Customer [430, 300] (on Place Order)`;

// Manual resize: the first note carries a hand-picked box via `(size …)`, the second stays auto.
const RESIZED_DSL = `title Resize Fixture
note Kickoff agenda [300, 200] (size 240x160)
note Hint [500, 200]`;

// Attachable notes: the note is pinned to the command via `(on …)`; its manual box travels along.
const NOTE_PINNED_DSL = `title Note Attachment Fixture
command Place Order [420, 320]
note Check credit limit [430, 220] (size 240x160) (on Place Order)`;

// Duplicate labels: the aggregate "Order" appears twice; `(id …)` suffixes plus `#id` references
// keep the arrows unambiguous (the spec's canonical design-level example).
const DUPLICATE_DSL = `title Duplicate Fixture
command Place Order [200, 290]
aggregate Order [420, 290] (id agg_order)
event Order Placed [640, 290]
command Ship Order [900, 290]
aggregate Order [1160, 290] (id agg_order_2)
event Order Shipped [1400, 290]
Place Order -> #agg_order
#agg_order -> Order Placed
Ship Order -> #agg_order_2
#agg_order_2 -> Order Shipped`;

function findByLabel(registry: ElementRegistry, label: string): EventStormingShape {
  const shape = registry.find(
    (el) => isEventStormingShape(el) && el.eventStormingLabel === label,
  ) as EventStormingShape | undefined;
  if (!shape) throw new Error(`shape not found: ${label}`);
  return shape;
}

describe('Modeler integration (real browser DOM)', () => {
  let container: HTMLElement;
  let modeler: Modeler;

  beforeEach(() => {
    container = document.createElement('div');
    // Explicit pixel size: without it the canvas collapses to 0 height and getBBox boxes are empty.
    container.style.width = '1024px';
    container.style.height = '768px';
    document.body.appendChild(container);
    modeler = new Modeler({ container });
  });

  afterEach(() => {
    modeler.destroy();
    container.remove();
  });

  it('imports a DSL board into the elementRegistry with real SVG layout', async () => {
    const { warnings } = await modeler.importDSL(DSL);
    expect(warnings).toEqual([]);

    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const labels = registry
      .filter(
        (el) =>
          isEventStormingShape(el) &&
          (el.eventStormingType === 'actor' || el.eventStormingType === 'command'),
      )
      .map((el) => (el as EventStormingShape).eventStormingLabel)
      .sort();
    expect(labels).toEqual(['Customer', 'Place Order']);

    // Browser-only invariant: a real getBBox() yields a non-zero box. jsdom returns 0×0, so this is
    // exactly why the integration layer needs Browser Mode.
    const gfx = registry.getGraphics(findByLabel(registry, 'Place Order')) as SVGGraphicsElement;
    const box = gfx.getBBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  it('roundtrips importDSL -> exportMap with stable labels and center positions', async () => {
    await modeler.importDSL(DSL);
    const board = modeler.exportMap();

    expect(board.elements.map((e) => e.label).sort()).toEqual(['Customer', 'Place Order']);
    expect(board.edges).toHaveLength(1);

    const placeOrder = board.elements.find((e) => e.label === 'Place Order');
    expect(placeOrder?.position.x).toBeCloseTo(420, 2);
    expect(placeOrder?.position.y).toBeCloseTo(320, 2);

    // saveSVG() depends on real layout — smoke-assert it serializes.
    const { svg } = await modeler.saveSVG();
    expect(svg).toContain('<svg');
  });

  it('moves freely in pixels (no re-projection) and restores geometry on undo', async () => {
    await modeler.importDSL(DSL);
    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const modeling = modeler.get<Modeling>('modeling');
    const commandStack = modeler.get<CommandStack>('commandStack');

    const placeOrder = findByLabel(registry, 'Place Order');
    const before = { x: placeOrder.x, y: placeOrder.y };

    // Drive the public modeling API (deterministic) — not a synthetic drag. diagram-js x/y IS
    // the positional truth: the exported center must shift by exactly the moved delta.
    modeling.moveShape(placeOrder, { x: 120, y: 0 });
    const movedX = placeOrder.x;
    expect(movedX).toBeCloseTo(before.x + 120, 1);
    expect(placeOrder.y).toBeCloseTo(before.y, 1);
    const moved = modeler.exportMap().elements.find((e) => e.label === 'Place Order');
    expect(moved?.position.x).toBeCloseTo(420 + 120, 2);
    expect(commandStack.canUndo()).toBe(true);

    // Undo restores the pixel geometry (and thus the exported center).
    modeler.undo();
    expect(placeOrder.x).toBeCloseTo(before.x, 1);
    const restored = modeler.exportMap().elements.find((e) => e.label === 'Place Order');
    expect(restored?.position.x).toBeCloseTo(420, 2);
    expect(modeler.canRedo()).toBe(true);

    // Redo re-applies the move geometry.
    modeler.redo();
    expect(placeOrder.x).toBeCloseTo(movedX, 1);
    expect(modeler.canUndo()).toBe(true);
  });

  it('round-trips a pinned actor via (on …) and moves it together with its host', async () => {
    const { warnings } = await modeler.importDSL(PINNED_DSL);
    expect(warnings).toEqual([]);

    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const modeling = modeler.get<Modeling>('modeling');
    const customer = findByLabel(registry, 'Customer');
    const placeOrder = findByLabel(registry, 'Place Order');

    // Attachment lives in the diagram-js host/attachers refs; the parent stays the root.
    expect(customer.host).toBe(placeOrder);
    expect(placeOrder.attachers).toContain(customer);
    expect(customer.parent?.id).toBe('event-storming-root');

    const exported = modeler.exportMap().elements.find((e) => e.label === 'Customer');
    if (exported?.elementType !== 'actor') throw new Error('actor missing in export');
    expect(exported.attachedTo).toBe(placeOrder.id);
    expect(modeler.exportDSL()).toContain('(on Place Order)');

    // Moving only the HOST drags the pinned actor along by the exact same delta.
    modeling.moveElements([placeOrder], { x: 150, y: 40 });
    expect(customer.x).toBeCloseTo(430 - customer.width / 2 + 150, 1);
    expect(customer.y).toBeCloseTo(300 - customer.height / 2 + 40, 1);
    const moved = modeler.exportMap().elements.find((e) => e.label === 'Customer');
    expect(moved?.position.x).toBeCloseTo(430 + 150, 2);
    expect(moved?.position.y).toBeCloseTo(300 + 40, 2);
  });

  it('round-trips a pinned note via (on …) and moves it together with its host', async () => {
    const { warnings } = await modeler.importDSL(NOTE_PINNED_DSL);
    expect(warnings).toEqual([]);

    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const modeling = modeler.get<Modeling>('modeling');
    const note = findByLabel(registry, 'Check credit limit');
    const placeOrder = findByLabel(registry, 'Place Order');

    // Notes pin exactly like actors/hotspots: host/attachers refs, the parent stays the root.
    expect(note.host).toBe(placeOrder);
    expect(placeOrder.attachers).toContain(note);
    expect(note.parent?.id).toBe('event-storming-root');

    const exported = modeler.exportMap().elements.find((e) => e.label === 'Check credit limit');
    if (exported?.elementType !== 'note') throw new Error('note missing in export');
    expect(exported.attachedTo).toBe(placeOrder.id);
    expect(exported.size).toEqual({ width: 240, height: 160 });
    // Canonical suffix order: `(size …)` before the final `(on …)`.
    expect(modeler.exportDSL()).toContain('(size 240x160) (on Place Order)');

    // Moving only the HOST drags the pinned note along by the exact same delta.
    modeling.moveElements([placeOrder], { x: 150, y: 40 });
    expect(note.x).toBeCloseTo(430 - note.width / 2 + 150, 1);
    expect(note.y).toBeCloseTo(220 - note.height / 2 + 40, 1);
    const moved = modeler.exportMap().elements.find((e) => e.label === 'Check credit limit');
    expect(moved?.position.x).toBeCloseTo(430 + 150, 2);
    expect(moved?.position.y).toBeCloseTo(220 + 40, 2);

    // The full DSL round-trip keeps the pinning and the manual box.
    await modeler.importDSL(modeler.exportDSL());
    const reloadedRegistry = modeler.get<ElementRegistry>('elementRegistry');
    const reloaded = findByLabel(reloadedRegistry, 'Check credit limit');
    expect(reloaded.host?.id).toBe(findByLabel(reloadedRegistry, 'Place Order').id);
    expect(reloaded.width).toBe(240);
    expect(reloaded.height).toBe(160);
  });

  it('deletes a pinned note with its host and restores the note pinning on undo', async () => {
    await modeler.importDSL(NOTE_PINNED_DSL);
    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const modeling = modeler.get<Modeling>('modeling');
    const noteId = findByLabel(registry, 'Check credit limit').id;
    const placeOrderId = findByLabel(registry, 'Place Order').id;

    modeling.removeElements([findByLabel(registry, 'Place Order')]);
    expect(registry.get(placeOrderId)).toBeUndefined();
    expect(registry.get(noteId)).toBeUndefined();

    modeler.undo();
    const note = registry.get(noteId) as EventStormingShape;
    expect(note.host?.id).toBe(placeOrderId);
    // The manual box (resize feature) survives the delete/undo cycle.
    expect(note.width).toBe(240);
    expect(note.height).toBe(160);
    const exported = modeler.exportMap().elements.find((e) => e.id === noteId);
    if (exported?.elementType !== 'note') throw new Error('note missing in export');
    expect(exported.attachedTo).toBe(placeOrderId);
  });

  it('round-trips a manually resized note via (size …) and keeps the box on relabel', async () => {
    const { warnings } = await modeler.importDSL(RESIZED_DSL);
    expect(warnings).toEqual([]);
    // The stock diagram-js resize feature is wired into the Modeler (handles + shape.resize).
    expect(modeler.get('resize')).toBeDefined();

    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const kickoff = findByLabel(registry, 'Kickoff agenda');
    expect(kickoff.width).toBe(240);
    expect(kickoff.height).toBe(160);
    expect(kickoff.x + kickoff.width / 2).toBeCloseTo(300, 2);
    expect(kickoff.y + kickoff.height / 2).toBeCloseTo(200, 2);

    // Export: manual box -> `size` in the board and `(size …)` in the DSL; auto note stays bare.
    const exported = modeler.exportMap().elements.find((e) => e.label === 'Kickoff agenda');
    if (exported?.elementType !== 'note') throw new Error('note missing in export');
    expect(exported.size).toEqual({ width: 240, height: 160 });
    expect(modeler.exportDSL()).toContain('(size 240x160)');
    const hint = modeler.exportMap().elements.find((e) => e.label === 'Hint');
    if (hint?.elementType !== 'note') throw new Error('note missing in export');
    expect('size' in hint).toBe(false);

    // Growing further via the stock shape.resize command (what a handle drag executes) is
    // exported and undoable back to the imported box.
    const modeling = modeler.get<Modeling>('modeling');
    modeling.resizeShape(kickoff, { x: kickoff.x, y: kickoff.y, width: 300, height: 200 });
    expect(modeler.exportDSL()).toContain('(size 300x200)');
    modeler.undo();
    expect(kickoff.width).toBe(240);
    expect(kickoff.height).toBe(160);

    // Relabel must NOT snap the manual box back to the text metrics.
    modeler
      .get<EventStormingModeling>('eventStormingModeling')
      .updateLabel(kickoff, 'Kickoff agenda v2');
    expect(kickoff.width).toBe(240);
    expect(kickoff.height).toBe(160);
    expect(modeler.exportDSL()).toContain('(size 240x160)');

    // The full DSL round-trip keeps the manual box.
    await modeler.importDSL(modeler.exportDSL());
    const reloaded = findByLabel(
      modeler.get<ElementRegistry>('elementRegistry'),
      'Kickoff agenda v2',
    );
    expect(reloaded.width).toBe(240);
    expect(reloaded.height).toBe(160);
  });

  it('shows resize handles on a selected note ONLY — stickies stay handle-free', async () => {
    await modeler.importDSL(PINNED_DSL + '\nnote Hint [600, 200]');
    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const selection = modeler.get<{ select(el: unknown): void }>('selection');

    // ResizeHandles renders one .djs-resizer per direction the shape.resize rule allows.
    selection.select(findByLabel(registry, 'Hint'));
    expect(container.querySelectorAll('.djs-resizer').length).toBe(8);

    selection.select(findByLabel(registry, 'Place Order'));
    expect(container.querySelectorAll('.djs-resizer').length).toBe(0);
  });

  it('round-trips duplicate labels via (id …) suffixes and #id arrow references', async () => {
    const { warnings } = await modeler.importDSL(DUPLICATE_DSL);
    expect(warnings).toEqual([]);

    // Both "Order" stickies exist as SEPARATE elements under their explicit ids.
    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const orders = registry.filter(
      (el) => isEventStormingShape(el) && (el as EventStormingShape).eventStormingLabel === 'Order',
    );
    expect(orders.map((el) => el.id).sort()).toEqual(['agg_order', 'agg_order_2']);

    // The ambiguous name serializes with `(id …)` and is referenced as `#id` in the arrows.
    const out = modeler.exportDSL();
    expect(out).toContain('aggregate Order [420, 290] (id agg_order)');
    expect(out).toContain('aggregate Order [1160, 290] (id agg_order_2)');
    expect(out).toContain('Place Order -> #agg_order');
    expect(out).toContain('#agg_order -> Order Placed');
    expect(out).toContain('Ship Order -> #agg_order_2');
    expect(out).toContain('#agg_order_2 -> Order Shipped');

    // Re-import of the export keeps both stickies and the arrows on the SAME endpoints.
    await modeler.importDSL(out);
    const board = modeler.exportMap();
    const orderIds = board.elements
      .filter((e) => e.label === 'Order')
      .map((e) => e.id)
      .sort();
    expect(orderIds).toEqual(['agg_order', 'agg_order_2']);
    const placed = board.elements.find((e) => e.label === 'Order Placed')!;
    const shipped = board.elements.find((e) => e.label === 'Order Shipped')!;
    expect(board.edges).toContainEqual(
      expect.objectContaining({ from: 'agg_order', to: placed.id }),
    );
    expect(board.edges).toContainEqual(
      expect.objectContaining({ from: 'agg_order_2', to: shipped.id }),
    );
    // Fixed point: the second export is byte-identical.
    expect(modeler.exportDSL()).toBe(out);
  });

  it('palette create gets a DSL-style id and a rename may duplicate an existing label', async () => {
    await modeler.importDSL(DUPLICATE_DSL);
    const modeling = modeler.get<Modeling>('modeling');
    const factory = modeler.get<EventStormingElementFactory>('eventStormingElementFactory');
    const root = modeler.get<Canvas>('canvas').getRootElement() as Shape;

    // Interactive create: numbered default label (pure UX) + a DSL-style id — NOT `shape_N`,
    // because the id surfaces in the `.storm` text once the label is duplicated.
    const created = factory.createNew('aggregate', 'Order');
    expect(created.eventStormingLabel).toBe('Order 2');
    expect(created.id).toBe('agg_1');
    modeling.createShape(created as unknown as Shape, { x: 1600, y: 290 }, root);

    // Renaming to an EXISTING label is allowed; the export disambiguates via `(id …)`.
    modeler.get<EventStormingModeling>('eventStormingModeling').updateLabel(created, 'Order');
    const board = modeler.exportMap();
    expect(board.elements.filter((e) => e.label === 'Order')).toHaveLength(3);
    expect(modeler.exportDSL()).toContain('aggregate Order [1600, 290] (id agg_1)');
  });

  it('shows kind captions on stickies (live DOM + SVG export) and hides them on toggle', async () => {
    await modeler.importDSL(DSL);
    const captionTexts = () =>
      [...container.querySelectorAll('text.event-storming-kind-caption')]
        .map((t) => t.textContent)
        .sort();

    // Default ON: the actor and the command each carry their kind caption.
    expect(captionTexts()).toEqual(['Actor', 'Command']);

    // saveSVG clones the live canvas — visible captions travel into the export.
    const { svg } = await modeler.saveSVG();
    expect(svg).toContain('event-storming-kind-caption');
    expect(svg).toContain('Command');

    // Toggling off via the DI service fires the pinned event and re-renders caption-free.
    const viewOptions = modeler.get<EventStormingViewOptions>('eventStormingViewOptions');
    let changed = 0;
    modeler.on('eventStorming.viewOptions.changed', () => changed++);
    viewOptions.setTypeCaptionsVisible(false);
    expect(changed).toBe(1);
    expect(captionTexts()).toEqual([]);
    const { svg: hidden } = await modeler.saveSVG();
    expect(hidden).not.toContain('event-storming-kind-caption');

    // Back on: captions re-appear without a re-import.
    viewOptions.setTypeCaptionsVisible(true);
    expect(captionTexts()).toEqual(['Actor', 'Command']);
  });

  it('deletes attachers with their host in ONE undoable step and restores the pinning on undo', async () => {
    await modeler.importDSL(PINNED_DSL);
    const registry = modeler.get<ElementRegistry>('elementRegistry');
    const modeling = modeler.get<Modeling>('modeling');
    const customerId = findByLabel(registry, 'Customer').id;
    const placeOrderId = findByLabel(registry, 'Place Order').id;

    modeling.removeElements([findByLabel(registry, 'Place Order')]);
    expect(registry.get(placeOrderId)).toBeUndefined();
    expect(registry.get(customerId)).toBeUndefined();

    modeler.undo();
    const customer = registry.get(customerId) as EventStormingShape;
    expect(customer.host?.id).toBe(placeOrderId);
    const exported = modeler.exportMap().elements.find((e) => e.id === customerId);
    if (exported?.elementType !== 'actor') throw new Error('actor missing in export');
    expect(exported.attachedTo).toBe(placeOrderId);
  });
});
