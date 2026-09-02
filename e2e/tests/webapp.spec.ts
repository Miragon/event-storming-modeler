import { test, expect } from '@playwright/test';
import {
  connectShapes,
  createStickyAt,
  dragShape,
  dragShapeTo,
  dropAt,
  slowDropAt,
  elementGfx,
  exportBoard,
  exportDSL,
  exportSvg,
  renameShape,
  resizeShapeBy,
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

  test('toggles the type captions on the stickies via the menu', async ({ page }) => {
    await page.locator('#btn-example').click();
    await expect(page.locator('#canvas .djs-element').first()).toBeVisible();

    // View preference, ON by default: every sticky carries its kind as a small caption.
    const captions = page.locator('#canvas .event-storming-kind-caption');
    await expect(captions.first()).toBeVisible();
    expect(await captions.count()).toBeGreaterThan(0);
    await expect(captions.filter({ hasText: 'Domain Event' }).first()).toBeVisible();
    await expect(page.locator('#m-type-captions')).toHaveAttribute('aria-checked', 'true');

    // Toggle off: the captions leave the live DOM immediately (forced re-render).
    await page.locator('#btn-menu').click();
    await page.locator('#m-type-captions').click();
    await expect(captions).toHaveCount(0);
    await expect(page.locator('#m-type-captions')).toHaveAttribute('aria-checked', 'false');

    // Toggle back on: the captions return.
    await page.locator('#btn-menu').click();
    await page.locator('#m-type-captions').click();
    await expect(captions.first()).toBeVisible();
    expect(await captions.count()).toBeGreaterThan(0);
    await expect(page.locator('#m-type-captions')).toHaveAttribute('aria-checked', 'true');
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

  test('appends a blank sticky, picks its type in the popup and labels it inline', async ({
    page,
  }) => {
    const source = await createStickyAt(page, 'event', 0.3, 0.4);

    // The single append entry drags out a BLANK sticky — the kind is chosen after placing.
    await selectShape(page, source);
    await page.locator('.djs-context-pad [data-action="append"]').click();
    // Human click timing: mousedown commits, the trailing click lands after the popup opened.
    await slowDropAt(page, 0.65, 0.55);

    // Landing the provisional sticky opens the change-type popup instead of the label editor.
    const popup = page.locator('.djs-popup');
    await expect(popup).toBeVisible();
    await popup.locator('[data-id="kind-policy"]').click();
    await expect(popup).toBeHidden();

    // Choosing "Policy" retypes the blank sticky; the append auto-arrow connects it to the source.
    await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(2);
    const board = await exportBoard(page);
    const appended = board.elements.find((element) => element.id !== source)!;
    expect(appended.elementType).toBe('policy');
    expect(board.edges).toHaveLength(1);
    expect([board.edges[0]!.from, board.edges[0]!.to].sort()).toEqual([source, appended.id].sort());

    // After the kind is picked, inline label editing follows (the old append auto-edit).
    const input = page.locator('.event-storming-label-input');
    await expect(input).toBeVisible();
    await input.fill('Notify Warehouse');
    await input.press('ControlOrMeta+Enter');
    await expect(input).toBeHidden();
    expect(
      (await exportBoard(page)).elements.find((element) => element.id === appended.id)!.label,
    ).toBe('Notify Warehouse');
  });

  test('dismissing the type popup removes the appended blank sticky again', async ({ page }) => {
    const source = await createStickyAt(page, 'event', 0.3, 0.4);

    await selectShape(page, source);
    await page.locator('.djs-context-pad [data-action="append"]').click();
    // Human click timing: mousedown commits, the trailing click lands after the popup opened.
    await slowDropAt(page, 0.65, 0.55);

    const popup = page.locator('.djs-popup');
    await expect(popup).toBeVisible();
    // The popup binds its global Escape handler (and takes focus) in a mount effect — wait for
    // the focus to land inside the popup so Escape cannot race the listener registration.
    await expect
      .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('.djs-popup'))))
      .toBe(true);
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();

    // No kind chosen -> the provisional sticky and its auto-arrow are removed again.
    await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(1);
    const board = await exportBoard(page);
    expect(board.elements[0]!.id).toBe(source);
    expect(board.edges).toHaveLength(0);
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

  test('switches the workshop level via the menu and the palette follows', async ({ page }) => {
    const palette = page.locator('.djs-palette');
    // A fresh board carries no level -> design, the full palette.
    await expect(palette.locator('[data-action="create.aggregate"]')).toBeVisible();
    await expect(palette.locator('[data-action="create.command"]')).toBeVisible();

    await page.locator('#btn-menu').click();
    await page.locator('#m-level-big-picture').click();

    // Big picture: aggregate/command leave the palette; events and the annotations/tools stay.
    await expect(palette.locator('[data-action="create.aggregate"]')).toHaveCount(0);
    await expect(palette.locator('[data-action="create.command"]')).toHaveCount(0);
    await expect(palette.locator('[data-action="create.event"]')).toBeVisible();
    await expect(palette.locator('[data-action="create.note"]')).toBeVisible();
    await expect(palette.locator('[data-action="lasso-tool"]')).toBeVisible();
    await expect(palette.locator('[data-action="draw-tool"]')).toBeVisible();

    // The level is part of the board -> serialized into the DSL, checked in the menu.
    expect(await exportDSL(page)).toContain('level big-picture');
    await expect(page.locator('#m-level-big-picture')).toHaveAttribute('aria-checked', 'true');

    // Back to design: the full palette returns.
    await page.locator('#btn-menu').click();
    await page.locator('#m-level-design').click();
    await expect(palette.locator('[data-action="create.aggregate"]')).toBeVisible();
    await expect(palette.locator('[data-action="create.command"]')).toBeVisible();
  });

  test('copies and pastes a sticky (the clone keeps the label)', async ({ page }) => {
    const id = await createStickyAt(page, 'event', 0.4, 0.5);
    await selectShape(page, id);

    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    // Paste attaches the clone to the cursor (like palette create) — drop it at a new spot.
    await dropAt(page, 0.65, 0.6);

    await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(2);
    // Duplicate labels are allowed: the clone keeps the source label under a fresh id.
    const elements = (await exportBoard(page)).elements;
    expect(elements.map((element) => element.label)).toEqual(['Domain Event', 'Domain Event']);
    const clone = elements.find((element) => element.id !== id)!;
    expect(clone.id).not.toBe(id);
    await expect(elementGfx(page, id)).toBeVisible();
    await expect(elementGfx(page, clone.id)).toBeVisible();
  });

  test('duplicate labels survive a DSL round-trip via internal ids', async ({ page }) => {
    const orderA = await createStickyAt(page, 'aggregate', 0.35, 0.3);
    const orderB = await createStickyAt(page, 'aggregate', 0.7, 0.3);
    const command = await createStickyAt(page, 'command', 0.35, 0.65);

    // Renaming onto an existing label is allowed — the same aggregate may appear twice.
    await renameShape(page, orderA, 'Order');
    await renameShape(page, orderB, 'Order');
    await connectShapes(page, command, orderA);
    expect((await exportBoard(page)).edges).toHaveLength(1);

    // Ambiguous labels surface the internal ids: `(id …)` suffixes and a `#id` arrow reference.
    const dsl = await exportDSL(page);
    expect(dsl).toContain('(id ');
    expect(dsl).toContain('-> #');

    // Export -> re-import: both "Order" stickies keep their ids, and the arrow still points at
    // the SAME sticky — the id reference disambiguates where the label cannot.
    await page.evaluate((text) => window.__eventStormingViewer.importDSL(text), dsl);
    const board = await exportBoard(page);
    const orders = board.elements.filter((element) => element.label === 'Order');
    expect(orders.map((element) => element.id).sort()).toEqual([orderA, orderB].sort());
    expect(board.edges).toHaveLength(1);
    expect(board.edges[0]!.to).toBe(orderA);
  });

  test('resizes a note by hand and the manual box survives a round-trip and a relabel', async ({
    page,
  }) => {
    const id = await createStickyAt(page, 'note', 0.35, 0.4);
    await renameShape(page, id, 'Kickoff questions');
    const noteOf = async () =>
      (await exportBoard(page)).elements.find((element) => element.elementType === 'note')!;

    // Auto-sized (box == text metrics): no size in the export, no suffix in the DSL.
    expect((await noteOf()).size).toBeUndefined();
    expect(await exportDSL(page)).not.toContain('(size ');

    // Fresh board -> zoom 1, so the hit box measures the model box in page px.
    const boxBefore = await elementGfx(page, id).locator('.djs-hit').boundingBox();
    await resizeShapeBy(page, id, { x: 80, y: 60 });

    const resized = (await noteOf()).size;
    expect(resized).toBeDefined();
    expect(resized!.width).toBeGreaterThan(boxBefore!.width + 40);
    expect(resized!.height).toBeGreaterThan(boxBefore!.height + 30);

    // Export -> re-import: the manual box is preserved by the DSL (3-decimal rounding).
    const dsl = await exportDSL(page);
    expect(dsl).toContain('(size ');
    await page.evaluate((text) => window.__eventStormingViewer.importDSL(text), dsl);
    const reimported = await noteOf();
    expect(reimported.size?.width).toBeCloseTo(resized!.width, 2);
    expect(reimported.size?.height).toBeCloseTo(resized!.height, 2);

    // Relabel: a MANUAL box is the user's choice — it must not snap back to the text metrics.
    await renameShape(page, reimported.id, 'Kickoff questions and open risks');
    const relabelled = await noteOf();
    expect(relabelled.label).toBe('Kickoff questions and open risks');
    expect(relabelled.size?.width).toBeCloseTo(resized!.width, 2);
    expect(relabelled.size?.height).toBeCloseTo(resized!.height, 2);
  });

  test('formats a note WYSIWYG and the markdown + alignment survive a DSL round-trip', async ({
    page,
  }) => {
    const id = await createStickyAt(page, 'note', 0.4, 0.4);

    // Notes open a rich contenteditable editor with a floating format toolbar on dblclick
    // (stickies keep the plain textarea — see renameShape).
    await elementGfx(page, id).locator('.djs-hit').dblclick();
    const editor = page.locator('.event-storming-note-editor');
    await expect(editor).toBeVisible();
    const toolbar = page.locator('.event-storming-note-toolbar');
    await expect(toolbar).toBeVisible();

    // Replace the default "Note" text, then bold the whole first line via the toolbar.
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Check legal');
    await page.keyboard.press('ControlOrMeta+a');
    await toolbar.locator('[data-action="note-bold"]').click();

    // Collapse the selection to the line end — Enter on a full selection would eat the text.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    // Chrome carries the bold typing state onto the new line — switch it off for plain text.
    await page.keyboard.press('ControlOrMeta+b');
    await toolbar.locator('[data-action="note-bullet"]').click();
    await page.keyboard.type('tomorrow');

    // One horizontal cycle: left (the default) -> center; vertical stays top.
    await toolbar.locator('[data-action="note-align-horizontal"]').click();

    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(editor).toBeHidden();

    // The label stores the markdown subset ('\n'-escaped); alignment gets its own note suffix.
    const dsl = await exportDSL(page);
    expect(dsl).toContain('**Check legal**');
    expect(dsl).toContain('- tomorrow');
    expect(dsl).toContain('(align center top)');

    // The canvas renders the formatting: a bold run and a '•' bullet marker line. The bold
    // weight may land as an SVG presentation attribute or inline style — computed style
    // covers both.
    const boldWeightOf = async (gfxId: string) =>
      elementGfx(page, gfxId)
        .locator('tspan', { hasText: 'Check legal' })
        .first()
        .evaluate((node) => getComputedStyle(node).fontWeight);
    const bulletLineOf = (gfxId: string) =>
      elementGfx(page, gfxId).locator('tspan').filter({ hasText: /^•/ }).first();
    expect(await boldWeightOf(id)).toBe('600');
    await expect(bulletLineOf(id)).toBeVisible();

    // Export -> re-import: markdown label, formatting and alignment are all preserved.
    await page.evaluate((text) => window.__eventStormingViewer.importDSL(text), dsl);
    const note = (await exportBoard(page)).elements.find(
      (element) => element.elementType === 'note',
    )!;
    expect(note.label).toBe('**Check legal**\n- tomorrow');
    expect(await exportDSL(page)).toContain('(align center top)');
    expect(await boldWeightOf(note.id)).toBe('600');
    await expect(bulletLineOf(note.id)).toBeVisible();
  });

  test('pins an actor onto a command, moves it with the host and detaches on empty canvas', async ({
    page,
  }) => {
    const command = await createStickyAt(page, 'command', 0.4, 0.5);
    const actor = await createStickyAt(page, 'actor', 0.15, 0.2);
    const positionOf = async (id: string) =>
      (await exportBoard(page)).elements.find((element) => element.id === id)!.position;

    // Drop the actor onto the command's lower-right quarter: still over the host (attach verdict),
    // but the smaller actor sticky leaves the command's center uncovered and grabbable.
    await dragShapeTo(page, actor, command, { x: 55, y: 35 });
    await expect
      .poll(
        async () =>
          (await exportBoard(page)).elements.find((element) => element.id === actor)?.attachedTo,
      )
      .toBe(command);
    expect(await exportDSL(page)).toContain('(on Command)');

    // Moving the host carries the pinned actor along by the exact same delta.
    const commandBefore = await positionOf(command);
    const actorBefore = await positionOf(actor);
    await dragShape(page, command, 0.7, 0.7);
    const commandAfter = await positionOf(command);
    const delta = { x: commandAfter.x - commandBefore.x, y: commandAfter.y - commandBefore.y };
    expect(Math.abs(delta.x) + Math.abs(delta.y)).toBeGreaterThan(50);
    const actorAfter = await positionOf(actor);
    expect(actorAfter.x - actorBefore.x).toBeCloseTo(delta.x, 1);
    expect(actorAfter.y - actorBefore.y).toBeCloseTo(delta.y, 1);

    // Dropping the pinned actor on empty canvas detaches it (host stays where it is).
    await dragShape(page, actor, 0.15, 0.2);
    await expect
      .poll(
        async () =>
          (await exportBoard(page)).elements.find((element) => element.id === actor)?.attachedTo,
      )
      .toBe(undefined);
    expect(await exportDSL(page)).not.toContain('(on ');
    expect(await positionOf(command)).toEqual(commandAfter);
  });

  test('pins a note onto a command, moves it with the host and detaches on empty canvas', async ({
    page,
  }) => {
    const command = await createStickyAt(page, 'command', 0.4, 0.5);
    const note = await createStickyAt(page, 'note', 0.15, 0.2);
    const positionOf = async (id: string) =>
      (await exportBoard(page)).elements.find((element) => element.id === id)!.position;

    // Drop the note onto the command's lower-right quarter: still over the host (attach verdict),
    // but the smaller auto-sized note leaves the command's center uncovered and grabbable.
    await dragShapeTo(page, note, command, { x: 55, y: 35 });
    await expect
      .poll(
        async () =>
          (await exportBoard(page)).elements.find((element) => element.id === note)?.attachedTo,
      )
      .toBe(command);
    expect(await exportDSL(page)).toContain('(on Command)');

    // Moving the host carries the pinned note along by the exact same delta.
    const commandBefore = await positionOf(command);
    const noteBefore = await positionOf(note);
    await dragShape(page, command, 0.7, 0.7);
    const commandAfter = await positionOf(command);
    const delta = { x: commandAfter.x - commandBefore.x, y: commandAfter.y - commandBefore.y };
    expect(Math.abs(delta.x) + Math.abs(delta.y)).toBeGreaterThan(50);
    const noteAfter = await positionOf(note);
    expect(noteAfter.x - noteBefore.x).toBeCloseTo(delta.x, 1);
    expect(noteAfter.y - noteBefore.y).toBeCloseTo(delta.y, 1);

    // Dropping the pinned note on empty canvas detaches it (host stays where it is).
    await dragShape(page, note, 0.15, 0.2);
    await expect
      .poll(
        async () =>
          (await exportBoard(page)).elements.find((element) => element.id === note)?.attachedTo,
      )
      .toBe(undefined);
    expect(await exportDSL(page)).not.toContain('(on ');
    expect(await positionOf(command)).toEqual(commandAfter);
  });
});
