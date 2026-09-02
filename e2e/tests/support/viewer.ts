import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Structural handle to the app's debug surface (exposed in apps/webapp/src/main.ts). We never import
 * the renderer here — only the shape we call into — so @miragon/event-storming-e2e stays free of
 * @miragon/event-storming-* dependencies.
 */
export interface EventStormingBoardElement {
  readonly id: string;
  readonly label: string;
  readonly elementType: string;
  readonly position: { readonly x: number; readonly y: number };
  /** Manual note box: present only when a note's size differs from its text-derived metrics. */
  readonly size?: { readonly width: number; readonly height: number };
  /** Pinning: id of the host sticky an actor/hotspot/note is attached to (absent when detached). */
  readonly attachedTo?: string;
}

export interface EventStormingBoardEdge {
  readonly id: string;
  readonly edgeType: string;
  readonly from: string;
  readonly to: string;
}

export interface EventStormingBoardExport {
  readonly config: { readonly title?: string };
  readonly elements: ReadonlyArray<EventStormingBoardElement>;
  readonly edges: ReadonlyArray<EventStormingBoardEdge>;
}

export interface EventStormingViewer {
  importDSL(text: string): Promise<unknown>;
  exportMap(): EventStormingBoardExport;
  exportDSL(): string;
  saveSVG(): Promise<{ svg: string }>;
}

declare global {
  interface Window {
    __eventStormingViewer: EventStormingViewer;
  }
}

interface Point {
  x: number;
  y: number;
}

export async function waitForViewer(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof window.__eventStormingViewer !== 'undefined');
}

/** Open the app and leave the landing start-screen with an empty canvas + working chrome (palette). */
export async function startNewBoard(page: Page): Promise<void> {
  await page.goto('/');
  await waitForViewer(page);
  await page.locator('#btn-new').click();
  await expect(page.locator('.djs-palette')).toBeVisible();
}

export function exportBoard(page: Page): Promise<EventStormingBoardExport> {
  return page.evaluate(() => window.__eventStormingViewer.exportMap());
}
export function exportDSL(page: Page): Promise<string> {
  return page.evaluate(() => window.__eventStormingViewer.exportDSL());
}
export function exportSvg(page: Page): Promise<string> {
  return page.evaluate(async () => (await window.__eventStormingViewer.saveSVG()).svg);
}

/** Absolute page coordinate at the given fraction of the #canvas bounding box. */
async function canvasPoint(page: Page, fractionX: number, fractionY: number): Promise<Point> {
  const box = await page.locator('#canvas').boundingBox();
  if (!box) throw new Error('#canvas has no bounding box');
  return { x: box.x + box.width * fractionX, y: box.y + box.height * fractionY };
}

/**
 * The diagram-js graphics group for a model element. `data-element-id` is the live diagram-js id
 * (e.g. `shape_12` / `connection_19`) — for UI-created elements this is NOT the label, so callers
 * pass the id returned by `createStickyAt`/`exportBoard`.
 */
export function elementGfx(page: Page, id: string): Locator {
  return page.locator(`#canvas [data-element-id="${id}"]`);
}
/**
 * The element's hit box (`.djs-hit` = element.width×height at the shape origin). For stickies this
 * is the full note rectangle (the label text lives inside it), so its center is a reliable
 * click/drag target.
 */
function shapeHit(page: Page, id: string): Locator {
  return elementGfx(page, id).locator('.djs-hit');
}

async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('locator has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Finish a pending diagram-js create/paste drag by dropping at a canvas point: a mousedown (with the
 * shape attached to the cursor) ends the drag and commits the element (see diagram-js Dragging
 * `trapClickAndEnd`). We move first so the create preview follows to the drop position.
 */
async function dropAtPoint(page: Page, point: Point): Promise<void> {
  await page.mouse.move(point.x, point.y, { steps: 6 });
  await page.mouse.down();
  await page.mouse.up();
}

/** Drop a pending create/paste drag at the given canvas fraction. */
export async function dropAt(page: Page, fractionX: number, fractionY: number): Promise<void> {
  await dropAtPoint(page, await canvasPoint(page, fractionX, fractionY));
}

/**
 * Drop with HUMAN click timing: the create commits on mousedown, the gesture's trailing
 * click follows only ~150ms later — after deferred UI (like the blank-append type chooser)
 * has appeared. Guards against that UI treating the trailing click as an outside click.
 */
export async function slowDropAt(page: Page, fractionX: number, fractionY: number): Promise<void> {
  const point = await canvasPoint(page, fractionX, fractionY);
  await page.mouse.move(point.x, point.y, { steps: 6 });
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.up();
}

/** Clear the selection so exported SVG/state does not depend on what happened to be selected. */
export async function deselectAll(page: Page): Promise<void> {
  await page.evaluate(() => {
    const viewer = window.__eventStormingViewer as unknown as {
      get(name: string): { select(element: unknown): void };
    };
    viewer.get('selection').select(null);
  });
}

/**
 * Reset transient interaction state before an SVG snapshot: clear the selection and move the pointer
 * off any element so the exported markup carries no `selected`/`hover` class from the last gesture.
 */
export async function settleForSnapshot(page: Page): Promise<void> {
  await deselectAll(page);
  // Park the pointer on the menu button (HTML chrome outside the canvas SVG) so the canvas root and
  // every element fire `element.out` — no `hover` class survives into the exported markup.
  await page.locator('#btn-menu').hover();
  await expect(page.locator('#canvas .hover')).toHaveCount(0);
}

/**
 * Create a sticky of the given kind via its palette entry (`data-action="create.<kind>"`), drop it
 * at the given canvas fraction, and return the new element's diagram-js id (found by diffing the
 * model before/after — creation auto-selects it too).
 */
export async function createStickyAt(
  page: Page,
  kind: string,
  fractionX: number,
  fractionY: number,
): Promise<string> {
  const before = new Set((await exportBoard(page)).elements.map((element) => element.id));
  await page.locator(`.djs-palette [data-action="create.${kind}"]`).click();
  await dropAtPoint(page, await canvasPoint(page, fractionX, fractionY));
  await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(before.size + 1);
  const created = (await exportBoard(page)).elements.find((element) => !before.has(element.id));
  if (!created) throw new Error('no new element after create');
  return created.id;
}

/**
 * Select a shape by clicking its hit box. Deselect first: diagram-js toggles selection, and a
 * freshly created shape is already selected — clicking it again would deselect it.
 */
export async function selectShape(page: Page, id: string): Promise<void> {
  await deselectAll(page);
  await shapeHit(page, id).click();
  await expect(page.locator('.djs-context-pad')).toBeVisible();
}

/**
 * Draw an arrow from `sourceId` to `targetId` via the context pad "Connect" action: click the
 * entry to start diagram-js Connect, move onto the target (hovers it), then mousedown to drop.
 */
export async function connectShapes(page: Page, sourceId: string, targetId: string): Promise<void> {
  await selectShape(page, sourceId);
  await page.locator('.djs-context-pad [data-action="connect"]').click();
  await dropAtPoint(page, await centerOf(shapeHit(page, targetId)));
}

/**
 * Drag a shape by its hit box to a new canvas fraction (a real mouse drag → modeling.moveShape).
 * `grabOffset` moves the grab point off the hit-box center — needed when an attached sticky covers
 * the host's center, which would grab the sticky instead of the host.
 */
export async function dragShape(
  page: Page,
  id: string,
  toFractionX: number,
  toFractionY: number,
  grabOffset: Point = { x: 0, y: 0 },
): Promise<void> {
  const center = await centerOf(shapeHit(page, id));
  const from = { x: center.x + grabOffset.x, y: center.y + grabOffset.y };
  const to = await canvasPoint(page, toFractionX, toFractionY);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
}

/**
 * Drag a shape onto another shape: grab it at its hit-box center and drop it at the target's
 * center plus an optional pixel offset (e.g. to leave the host's center grabbable under an
 * attached sticky). Dropping an actor/hotspot/note over a host-kind sticky attaches (pins) it.
 */
export async function dragShapeTo(
  page: Page,
  id: string,
  targetId: string,
  offset: Point = { x: 0, y: 0 },
): Promise<void> {
  const from = await centerOf(shapeHit(page, id));
  const target = await centerOf(shapeHit(page, targetId));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(target.x + offset.x, target.y + offset.y, { steps: 10 });
  await page.mouse.up();
}

/**
 * Resize a shape by dragging its south-east resize handle by a pixel delta (a real mouse drag →
 * diagram-js Resize → the resize command). Handles exist only while the shape is the single
 * selection and the resize rule allows it, so select first (mirrors selectShape) and wait for the
 * handle — diagram-js ResizeHandles tags each handle group with the element id + direction.
 */
export async function resizeShapeBy(page: Page, id: string, delta: Point): Promise<void> {
  await selectShape(page, id);
  const handle = page.locator(`#canvas .djs-resizer-${id}.djs-resizer-se`);
  await expect(handle).toBeVisible();
  const from = await centerOf(handle);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + delta.x, from.y + delta.y, { steps: 10 });
  await page.mouse.up();
}

/**
 * Rename a shape inline: double-click, replace the text in the overlay editor, commit with
 * Ctrl+Enter (plain Enter inserts a line break — sticky text is multi-line).
 */
export async function renameShape(page: Page, id: string, newLabel: string): Promise<void> {
  await shapeHit(page, id).dblclick();
  const input = page.locator('.event-storming-label-input');
  await expect(input).toBeVisible();
  await input.fill(newLabel);
  await input.press('Control+Enter');
  await expect(input).toBeHidden();
}
