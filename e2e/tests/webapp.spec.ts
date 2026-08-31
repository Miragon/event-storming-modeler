import { test, expect } from '@playwright/test';
import {
  connectShapes,
  createStickyAt,
  dragShape,
  dropAt,
  elementGfx,
  exportBoard,
  exportDSL,
  exportSvg,
  renameShape,
  selectShape,
  settleForSnapshot,
  startNewBoard,
  waitForViewer,
} from './support/viewer.js';

/**
 * End-to-end coverage for the webapp. Two groups:
 *  - "export round-trip": import/export correctness (DSL round-trip, SVG, Order Checkout render).
 *  - "modelling interactions": drive the real tool (palette, context pad, inline editing, keyboard)
 *    and assert the result through the `window.__eventStormingViewer` debug surface.
 * All tests are independent and share no state.
 */

/** Every palette-creatable sticky kind with its default label (drawing is a tool, not a create). */
const STICKY_KINDS = [
  { kind: 'event', label: 'Domain Event' },
  { kind: 'command', label: 'Command' },
  { kind: 'actor', label: 'Actor' },
  { kind: 'aggregate', label: 'Aggregate' },
  { kind: 'policy', label: 'Policy' },
  { kind: 'readmodel', label: 'Read Model' },
  { kind: 'external', label: 'External System' },
  { kind: 'hotspot', label: 'Hotspot' },
  { kind: 'note', label: 'Note' },
] as const;

test.describe('webapp export round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
  });

  test('loads the Order Checkout example and exports stable DSL + SVG', async ({ page }) => {
    // Real UI: the app opens on the landing (empty canvas), which shows a start card —
    // load the example from its "Show example" button.
    await page.locator('#btn-example').click();

    // The renderer paints one .djs-element per node/edge once import.done fires.
    await expect(page.locator('#canvas .djs-element').first()).toBeVisible();

    const board = await exportBoard(page);
    expect(board.elements.length).toBeGreaterThan(0);
    expect(board.edges.length).toBeGreaterThan(0);
    expect(board.config.title).toBe('Order Checkout');

    const labels = board.elements.map((element) => element.label);
    expect(labels).toContain('Order Placed');
    expect(labels).toContain('Place Order');

    const dsl = await exportDSL(page);
    expect(dsl).toContain('title Order Checkout');
    expect(dsl).toMatch(/event Order Placed \[/);

    const svg = await exportSvg(page);
    expect(svg).toContain('<svg');
  });

  test('import -> export -> re-import is a lossless DSL fixed point', async ({ page }) => {
    const source = [
      'title Round Trip',
      'event A [200, 300]',
      'command B [400, 300]',
      'A -> B',
    ].join('\n');

    const result = await page.evaluate(async (dsl) => {
      const viewer = window.__eventStormingViewer;
      await viewer.importDSL(dsl);
      const first = viewer.exportDSL();
      await viewer.importDSL(first); // round-trip
      return { first, second: viewer.exportDSL(), map: viewer.exportMap() };
    }, source);

    expect(result.map.elements.map((element) => element.label).sort()).toEqual(['A', 'B']);
    expect(result.map.edges).toHaveLength(1);
    // Round-trip stability: re-serializing the serialized form is a fixed point.
    expect(result.second).toBe(result.first);
    expect(result.first).toContain('title Round Trip');
  });

  test('exports the example board as an SVG matching the snapshot', async ({ page }) => {
    await page.locator('#btn-example').click();
    await expect(page.locator('#canvas .djs-element').first()).toBeVisible();
    await settleForSnapshot(page);

    const svg = await exportSvg(page);
    expect(svg).toContain('<svg');
    expect(svg).toMatchSnapshot('example-board.svg');
  });
});

test.describe('webapp modelling interactions', () => {
  test.beforeEach(async ({ page }) => {
    await startNewBoard(page);
  });

  test('creates every sticky kind from the palette with its default label', async ({ page }) => {
    for (const [index, sticky] of STICKY_KINDS.entries()) {
      // Spread the drops over a grid so stickies land apart from each other.
      const fractionX = 0.15 + (index % 3) * 0.25;
      const fractionY = 0.2 + Math.floor(index / 3) * 0.25;
      const id = await createStickyAt(page, sticky.kind, fractionX, fractionY);

      const created = (await exportBoard(page)).elements.find((element) => element.id === id);
      expect(created?.elementType).toBe(sticky.kind);
      expect(created?.label).toBe(sticky.label);
      await expect(elementGfx(page, id)).toBeVisible();
    }
    expect((await exportBoard(page)).elements).toHaveLength(STICKY_KINDS.length);
  });

  test('moves a sticky freely and the position survives a DSL round-trip', async ({ page }) => {
    const id = await createStickyAt(page, 'event', 0.3, 0.35);
    const before = (await exportBoard(page)).elements[0]!.position;

    // Free canvas: a diagonal drag changes both coordinates — no axis re-projection.
    await dragShape(page, id, 0.7, 0.65);

    const after = (await exportBoard(page)).elements[0]!.position;
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);

    // Export -> re-import: the dragged position is preserved by the DSL (3-decimal rounding).
    const dsl = await exportDSL(page);
    await page.evaluate((text) => window.__eventStormingViewer.importDSL(text), dsl);
    const reimported = (await exportBoard(page)).elements[0]!.position;
    expect(reimported.x).toBeCloseTo(after.x, 2);
    expect(reimported.y).toBeCloseTo(after.y, 2);
  });

  test('creates an arrow between two stickies', async ({ page }) => {
    const source = await createStickyAt(page, 'command', 0.35, 0.4);
    const target = await createStickyAt(page, 'event', 0.65, 0.6);

    await connectShapes(page, source, target);

    const board = await exportBoard(page);
    expect(board.edges).toHaveLength(1);
    const edge = board.edges[0]!;
    expect(edge.edgeType).toBe('arrow');
    expect([edge.from, edge.to].sort()).toEqual([source, target].sort());
  });

  test('renames a sticky inline and the new label survives a round-trip', async ({ page }) => {
    const id = await createStickyAt(page, 'event', 0.45, 0.5);

    await renameShape(page, id, 'Order Placed');
    expect((await exportBoard(page)).elements.map((element) => element.label)).toEqual([
      'Order Placed',
    ]);

    // Export -> re-import: the renamed label is stable.
    const dsl = await exportDSL(page);
    expect(dsl).toMatch(/event Order Placed \[/);
    await page.evaluate((text) => window.__eventStormingViewer.importDSL(text), dsl);
    expect((await exportBoard(page)).elements.map((element) => element.label)).toEqual([
      'Order Placed',
    ]);
  });

  test('deletes a sticky', async ({ page }) => {
    const id = await createStickyAt(page, 'event', 0.45, 0.5);
    await selectShape(page, id);

    await page.keyboard.press('Delete');

    await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(0);
    await expect(elementGfx(page, id)).toHaveCount(0);
  });

  test('copies and pastes a sticky (labels stay unique)', async ({ page }) => {
    const id = await createStickyAt(page, 'event', 0.4, 0.5);
    await selectShape(page, id);

    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    // Paste attaches the clone to the cursor (like palette create) — drop it at a new spot.
    await dropAt(page, 0.65, 0.6);

    await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(2);
    const labels = (await exportBoard(page)).elements.map((element) => element.label).sort();
    expect(labels).toEqual(['Domain Event', 'Domain Event 2']);
  });
});
