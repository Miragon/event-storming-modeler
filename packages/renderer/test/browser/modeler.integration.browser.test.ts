import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import { Modeler } from '../../src/index.js';
import { isEventStormingShape, type EventStormingShape } from '../../src/model/di-types.js';
// Pull the real stylesheet in so layout (getBBox) matches production. src/index.ts also imports it.
import '../../src/assets/event-storming.css';

// Minimal board: an actor issuing a command. DSL coords are [x, y] board pixels = element CENTER.
const DSL = `title Integration Fixture
actor Customer [200, 300]
command Place Order [420, 320]
Customer -> Place Order`;

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
});
