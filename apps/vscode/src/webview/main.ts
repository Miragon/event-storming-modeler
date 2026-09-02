// Geist (Miragon typeface), self-hosted variable font (all weights in one file). esbuild inlines the
// woff2 as data-URLs; the webview has no code area, so Geist Mono is not needed here.
import '@fontsource-variable/geist/wght.css';
// Pulls the renderer CSS (incl. diagram-js.css) into the bundle.
import {
  Modeler,
  iconMarkup,
  ICON_MENU,
  ICON_FIT,
  ICON_DOWNLOAD,
  ICON_IMAGE,
} from '@miragon/event-storming-renderer';
import './style.css';
import type { BoardLevel } from '@miragon/event-storming-schema-model';
import { svgToPng, blobToBase64 } from './io.js';
import type { HostToWebview, WebviewToHost } from '../protocol.js';

interface VsCodeApi {
  postMessage(msg: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare const acquireVsCodeApi: () => VsCodeApi;
const vscode = acquireVsCodeApi();

const container = document.getElementById('canvas');
const toolbar = document.getElementById('toolbar');
if (!container || !toolbar) throw new Error('Webview layout incomplete (#canvas/#toolbar).');

const modeler = new Modeler({ container });
// Debug handle (like the webapp). Harmless in the sandboxed webview, helpful for diagnostics/tests.
(globalThis as Record<string, unknown>).__eventStormingModeler = modeler;

// ---------------------------------------------------------------------------
// Two-way sync with the document
// ---------------------------------------------------------------------------

let lastText = ''; // text last reconciled with the host
let importing = false; // suppresses the edit echo during import
let importFailed = false; // the last import (e.g. externally typed text) was unparsable
let initialized = false; // first init done -> preserve zoom/viewport from then on

// Serialize imports STRICTLY: init/update arrive as (un-awaited) messages; without chaining, two
// quick updates (e.g. several undos) could import concurrently and finish in the wrong order.
let importChain: Promise<void> = Promise.resolve();
function enqueueImport(text: string, fit: boolean): Promise<void> {
  importChain = importChain.then(() => importText(text, fit)).catch(() => {});
  return importChain;
}

/** Compares two DSL texts modulo line endings/trailing whitespace (= save transforms). */
function sameBoardText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();
}

/**
 * Loads `text` into the modeler. `fit=true` (first load) fits the board; `fit=false` (external or
 * echo-missed change) PRESERVES the current zoom/viewport — otherwise every change mirrored back by
 * the host (e.g. the `insertFinalNewline` appended on save) would reset the zoom to default. If the
 * incoming `update` describes the same board as the current state (only whitespace/EOL difference),
 * it is not re-imported at all (no flicker, no zoom/selection loss).
 */
async function importText(text: string, fit: boolean): Promise<void> {
  if (!fit && initialized && sameBoardText(text, modeler.exportDSL())) {
    lastText = text;
    return;
  }
  importing = true;
  const prevView = fit ? undefined : currentViewbox();
  try {
    await modeler.importDSL(text);
    lastText = text;
    importFailed = false;
    if (fit) fitView();
    else if (prevView) restoreViewbox(prevView);
  } catch (err) {
    // Parse error: the canvas keeps showing the last good board. Block pushEdit so a graphical
    // action doesn't overwrite the (just externally typed) unparsable text — until a successful
    // re-import (valid 'update') restores a known state.
    importFailed = true;
    vscode.postMessage({
      type: 'error',
      message: `Could not parse this Event Storming board: ${(err as Error).message}`,
    });
  } finally {
    importing = false;
    initialized = true;
  }
}

/** Graphical change -> serialize DSL and (only on a real difference) report it to the host. */
function pushEdit(): void {
  if (importing || importFailed) return;
  const dsl = modeler.exportDSL();
  if (dsl === lastText) return;
  lastText = dsl;
  vscode.postMessage({ type: 'edit', text: dsl });
}

modeler.on('commandStack.changed', pushEdit);
// Do NOT hook fitView globally onto import.done — otherwise every mirrored-back 'update' resets the
// zoom. Fit happens deliberately: on first load (importText fit=true) and via the menu's
// "Fit to view" item.

window.addEventListener('message', (event: MessageEvent<HostToWebview>) => {
  const msg = event.data;
  if (msg.type === 'init') void enqueueImport(msg.text, true);
  else if (msg.type === 'update') void enqueueImport(msg.text, false);
});

// ---------------------------------------------------------------------------
// Viewport: fit the board, leaving room at the top for the floating toolbar
// ---------------------------------------------------------------------------

const VIEW_INSET = { top: 72, side: 28, bottom: 28 };
function fitView(): void {
  const canvas = modeler.get<{
    viewbox(box?: { x: number; y: number; width: number; height: number }): void;
  }>('canvas');
  const bounds = modeler.get<{
    contentBounds(): { x: number; y: number; width: number; height: number };
  }>('boardBounds');
  const rect = container!.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  if (!W || !H) return;
  const p = bounds.contentBounds();
  const availW = Math.max(W - 2 * VIEW_INSET.side, 50);
  const availH = Math.max(H - VIEW_INSET.top - VIEW_INSET.bottom, 50);
  const s = Math.min(availW / p.width, availH / p.height);
  canvas.viewbox({
    x: p.x + p.width / 2 - W / 2 / s,
    y: p.y - VIEW_INSET.top / s,
    width: W / s,
    height: H / s,
  });
}

type ViewBox = { x: number; y: number; width: number; height: number };

/** Read the current zoom/viewport (or undefined if there is no canvas yet). */
function currentViewbox(): ViewBox | undefined {
  try {
    const vb = modeler.get<{ viewbox(): ViewBox }>('canvas').viewbox();
    return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
  } catch {
    return undefined;
  }
}

function restoreViewbox(box: ViewBox): void {
  try {
    modeler.get<{ viewbox(box: ViewBox): void }>('canvas').viewbox(box);
  } catch {
    /* no canvas yet -> ignore */
  }
}

function deselect(): void {
  modeler.get<{ select: (e: unknown) => void }>('selection').select(null);
}

// ---------------------------------------------------------------------------
// Menu (collapsed hamburger top right, Excalidraw style; chrome in the VS Code theme, canvas keeps
// the Miragon look). NO undo/redo — VS Code handles that via Ctrl/Cmd+Z out of the box
// (the modeler's keyboard service is bound within the webview canvas).
// ---------------------------------------------------------------------------

function setMenuOpen(open: boolean): void {
  dropdown.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
}

function menuItem(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'menu-item';
  item.setAttribute('role', 'menuitem');
  item.innerHTML = `${iconMarkup(icon, 16)}<span>${label}</span>`;
  item.addEventListener('click', () => {
    setMenuOpen(false);
    onClick();
  });
  return item;
}

function menuSep(): HTMLDivElement {
  const sep = document.createElement('div');
  sep.className = 'menu-sep';
  sep.setAttribute('role', 'separator');
  return sep;
}

function menuLabel(text: string): HTMLDivElement {
  const label = document.createElement('div');
  label.className = 'menu-label';
  label.setAttribute('role', 'presentation');
  label.textContent = text;
  return label;
}

// --- Workshop level (menu radio group) ---

// check — Material Icons (same source as the renderer's icon set); marks the active level.
const ICON_CHECK = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';

const LEVELS: ReadonlyArray<{ level: BoardLevel; label: string }> = [
  { level: 'big-picture', label: 'Big Picture' },
  { level: 'process', label: 'Process Modelling' },
  { level: 'design', label: 'Software Design' },
];

function levelModeling(): { setLevel(level: BoardLevel): void; getLevel(): BoardLevel } {
  return modeler.get('eventStormingModeling');
}

/** Checkmark in the icon slot marks a checked item; a spacer keeps the labels aligned. */
function levelMarkup(label: string, active: boolean): string {
  return active
    ? `${iconMarkup(ICON_CHECK, 16)}<span>${label}</span>`
    : `<span class="menu-icon-spacer"></span><span>${label}</span>`;
}

const levelItems = LEVELS.map((spec) => {
  const item = menuItem(ICON_CHECK, spec.label, () => levelModeling().setLevel(spec.level));
  item.setAttribute('role', 'menuitemradio');
  item.setAttribute('aria-checked', 'false');
  // Unchecked until the first import reports the board's level (the click wiring survives).
  item.innerHTML = levelMarkup(spec.label, false);
  return { ...spec, item };
});

function updateLevelMenu(): void {
  const active = levelModeling().getLevel();
  for (const { level, label, item } of levelItems) {
    item.setAttribute('aria-checked', String(level === active));
    item.innerHTML = levelMarkup(label, level === active);
  }
}

// setLevel is undoable and the level also arrives via document updates — re-sync on both.
modeler.on('commandStack.changed', updateLevelMenu);
modeler.on('import.done', updateLevelMenu);

// --- Type captions (menu checkbox; a VIEW preference, persisted in the webview state) ---

const viewOptions = modeler.get<{
  typeCaptionsVisible(): boolean;
  setTypeCaptionsVisible(visible: boolean): void;
}>('eventStormingViewOptions');

const typeCaptionsItem = menuItem(ICON_CHECK, 'Type captions', () => {
  const visible = !viewOptions.typeCaptionsVisible();
  viewOptions.setTypeCaptionsVisible(visible);
  // Merge into the webview state — never clobber keys other consumers may have stored.
  const state = (vscode.getState() ?? {}) as Record<string, unknown>;
  vscode.setState({ ...state, typeCaptionsVisible: visible });
  updateTypeCaptionsItem();
});
typeCaptionsItem.setAttribute('role', 'menuitemcheckbox');

function updateTypeCaptionsItem(): void {
  const visible = viewOptions.typeCaptionsVisible();
  typeCaptionsItem.setAttribute('aria-checked', String(visible));
  typeCaptionsItem.innerHTML = levelMarkup('Type captions', visible);
}

// Webview state survives tab switches/reloads — re-apply the stored choice before the first paint.
const storedState = (vscode.getState() ?? {}) as Record<string, unknown>;
if (storedState.typeCaptionsVisible === false) viewOptions.setTypeCaptionsVisible(false);
updateTypeCaptionsItem();

const menuBtn = document.createElement('button');
menuBtn.type = 'button';
menuBtn.className = 'menu-btn';
menuBtn.title = 'Menu';
menuBtn.setAttribute('aria-label', 'Menu');
menuBtn.setAttribute('aria-haspopup', 'true');
menuBtn.setAttribute('aria-expanded', 'false');
menuBtn.innerHTML = iconMarkup(ICON_MENU, 18);

const dropdown = document.createElement('div');
dropdown.className = 'menu-dropdown';
dropdown.setAttribute('role', 'menu');
dropdown.hidden = true;

dropdown.append(
  menuItem(ICON_FIT, 'Fit to view', fitView),
  menuSep(),
  menuItem(ICON_DOWNLOAD, 'Export · SVG', exportSvg),
  menuItem(ICON_IMAGE, 'Export · PNG', exportPng),
  menuSep(),
  menuLabel('Level'),
  ...levelItems.map(({ item }) => item),
  menuSep(),
  typeCaptionsItem,
);

toolbar.append(menuBtn, dropdown);

menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setMenuOpen(dropdown.hidden === true);
});
document.addEventListener('click', (e) => {
  if (!(e.target as Element | null)?.closest('#toolbar')) setMenuOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenuOpen(false);
});

// ---------------------------------------------------------------------------
// Export (the webview rasterizes/serializes; the host shows the save dialog)
// ---------------------------------------------------------------------------

async function exportSvg(): Promise<void> {
  deselect();
  try {
    const { svg } = await modeler.saveSVG();
    vscode.postMessage({ type: 'export', format: 'svg', data: svg });
  } catch (err) {
    vscode.postMessage({ type: 'error', message: `SVG export failed: ${(err as Error).message}` });
  }
}

async function exportPng(): Promise<void> {
  deselect();
  try {
    const { svg } = await modeler.saveSVG();
    const blob = await svgToPng(svg);
    vscode.postMessage({ type: 'export', format: 'png', data: await blobToBase64(blob) });
  } catch (err) {
    vscode.postMessage({ type: 'error', message: `PNG export failed: ${(err as Error).message}` });
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

vscode.postMessage({ type: 'ready' });
