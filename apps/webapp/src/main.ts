// Geist (Miragon corporate typeface — Vercel, SIL OFL), self-hosted variable font (all weights in one
// file), no Google Fonts CDN (offline & GDPR). Geist Mono for the export/code textarea.
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import '@miragon/event-storming-renderer/assets/event-storming.css';
import './style.css';
import {
  Modeler,
  iconMarkup,
  ICON_MENU,
  ICON_FOLDER_OPEN,
  ICON_EYE,
  ICON_NEW,
  ICON_UNDO,
  ICON_REDO,
  ICON_DATA_OBJECT,
  ICON_CODE,
  ICON_DOWNLOAD,
  ICON_IMAGE,
  ICON_SHARE,
} from '@miragon/event-storming-renderer';
import { createEmptyBoard } from '@miragon/event-storming-schema-model';
import { readHashMap, writeHashMap, shareUrl } from './share.js';
import { openFile, svgToPng, downloadBlob, downloadText } from './io.js';
import { showToast } from './toast.js';

const EXAMPLE_BOARD = `title Order Checkout

actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [420, 290]
event Order Placed [620, 300]
policy When order placed, ship it [800, 300]
command Ship Order [980, 420]
event Order Shipped [1160, 420]
readmodel Order Status [620, 120]
external Payment Provider [420, 520]
hotspot Double payment on retry? [620, 520]
note Big-picture session: checkout flow [80, 80]

Customer -> Place Order
Place Order -> Order
Place Order -> Payment Provider
Order -> Order Placed
Order Placed -> Order Status
Order Placed -> When order placed, ship it
When order placed, ship it -> Ship Order
Ship Order -> Order
Order -> Order Shipped`;

const container = document.getElementById('canvas');
if (!container) throw new Error('#canvas is missing');

const viewer = new Modeler({ container });
Object.assign(globalThis as Record<string, unknown>, {
  __eventStormingViewer: viewer,
  __eventStormingIo: { openFile, svgToPng },
});

// --- Default viewport after import/reload ---
// Fit the board content, but leave room at the top for the floating chrome (palette center, menu
// left, share right) and some margin on the sides/bottom -> nothing overlaps.
const VIEW_INSET = { top: 92, side: 32, bottom: 32 };
function fitView(): void {
  if (!container) return;
  const canvas = viewer.get('canvas') as {
    viewbox(box?: { x: number; y: number; width: number; height: number }): void;
  };
  const bounds = viewer.get('boardBounds') as {
    contentBounds(): { x: number; y: number; width: number; height: number };
  };
  const rect = container.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  if (!W || !H) return;
  const p = bounds.contentBounds();
  const availW = Math.max(W - 2 * VIEW_INSET.side, 50);
  const availH = Math.max(H - VIEW_INSET.top - VIEW_INSET.bottom, 50);
  const s = Math.min(availW / p.width, availH / p.height);
  canvas.viewbox({
    x: p.x + p.width / 2 - W / 2 / s,
    y: p.y - VIEW_INSET.top / s, // top edge below the chrome
    width: W / s,
    height: H / s,
  });
}
viewer.on('import.done', fitView);

// --- Button / menu icons ---
function setLabel(id: string, icon: string, label: string): void {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `${iconMarkup(icon, 16)}<span>${label}</span>`;
}
setLabel('btn-menu', ICON_MENU, 'Menu');
setLabel('btn-share', ICON_SHARE, 'Share');
setLabel('m-open', ICON_FOLDER_OPEN, 'Open…');
setLabel('m-example', ICON_EYE, 'Show example');
setLabel('m-new', ICON_NEW, 'New / clear');
setLabel('m-undo', ICON_UNDO, 'Undo');
setLabel('m-redo', ICON_REDO, 'Redo');
setLabel('m-json', ICON_DATA_OBJECT, 'Export · JSON');
setLabel('m-dsl', ICON_CODE, 'Export · DSL (.storm)');
setLabel('m-svg', ICON_DOWNLOAD, 'Export · SVG');
setLabel('m-png', ICON_IMAGE, 'Export · PNG (2×)');
setLabel('m-png-transparent', ICON_IMAGE, 'Export · PNG (4×, transparent)');

// Keep the legal copyright year current without a yearly manual edit.
const legalYear = document.getElementById('legal-year');
if (legalYear) legalYear.textContent = String(new Date().getFullYear());

// --- Hamburger menu (Excalidraw style): open/close ---
const menuBtn = document.getElementById('btn-menu');
const dropdown = document.getElementById('menu-dropdown');
function setMenuOpen(open: boolean): void {
  if (!dropdown || !menuBtn) return;
  dropdown.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
}
menuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  setMenuOpen(dropdown?.hidden === true);
});
document.addEventListener('click', (e) => {
  if (!(e.target as Element | null)?.closest('.app-menu')) setMenuOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenuOpen(false);
});
function onMenu(id: string, action: () => void): void {
  document.getElementById(id)?.addEventListener('click', () => {
    setMenuOpen(false);
    action();
  });
}

/*
 * Landing / empty state + URL sync (central: what happens when the model changes).
 * The "landing" is the start screen (empty board, user hasn't started yet): it shows the start
 * card and hides only the zoom control (menu, share and palette stay usable). Picking "New board"
 * or "Show example" — or the presence of any non-empty board — leaves it for good this session.
 */
const emptyState = document.getElementById('empty-state');
const appEl = document.getElementById('app');
let hasStarted = false;
function updateLanding(): void {
  if (!isEmptyBoard()) hasStarted = true;
  const landing = !hasStarted && isEmptyBoard();
  if (emptyState) emptyState.hidden = !landing;
  appEl?.classList.toggle('app--landing', landing);
}
function isEmptyBoard(): boolean {
  const board = viewer.exportMap();
  return board.elements.length === 0 && board.edges.length === 0;
}
let urlTimer: ReturnType<typeof setTimeout> | undefined;
function syncUrlNow(): void {
  clearTimeout(urlTimer);
  urlTimer = undefined;
  // Empty board -> drop the hash (clean URL, an empty start stays shareable).
  if (isEmptyBoard()) history.replaceState(null, '', location.pathname + location.search);
  else void writeHashMap(viewer.exportDSL());
}
/**
 * Toggle the empty state + sync the URL. Discrete edit actions (create, connect, move, delete) are
 * persisted IMMEDIATELY — otherwise a change just made (e.g. a freshly drawn arrow) is lost on a
 * very fast reload. The debounce path stays available for high-frequency change sources (one event
 * per keystroke), flushed on beforeunload/pagehide below.
 */
function onModelChanged(debounce = false): void {
  updateLanding();
  clearTimeout(urlTimer);
  if (debounce) urlTimer = setTimeout(syncUrlNow, 350);
  else syncUrlNow();
}
viewer.on('commandStack.changed', () => onModelChanged());
viewer.on('import.done', () => onModelChanged());
// Belt-and-suspenders: flush a pending (debounced) sync before leaving the page.
const flushUrl = (): void => {
  if (urlTimer !== undefined) syncUrlNow();
};
window.addEventListener('beforeunload', flushUrl);
window.addEventListener('pagehide', flushUrl);

/**
 * Surface parser/import findings: console detail + a single non-blocking info toast (import
 *  proceeds regardless). Silent-until-now warnings become visible without a modal.
 */
function logWarnings(warnings: ReadonlyArray<{ message: string }>): void {
  for (const w of warnings) console.warn(`[event-storming-import] ${w.message}`);
  if (warnings.length) {
    showToast(`Imported with ${warnings.length} warning(s) — see console`, 'info');
  }
}

// --- Actions ---
function showExample(): void {
  void viewer.importDSL(EXAMPLE_BOARD).then(({ warnings }) => logWarnings(warnings));
}
function clearCanvas(): void {
  void viewer.importMap(createEmptyBoard('New board'));
}
function deselect(): void {
  (viewer.get('selection') as { select: (e: unknown) => void }).select(null);
}

const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
function pickFile(): void {
  fileInput?.click();
}
fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void load(file);
  fileInput.value = '';
});
async function load(file: File): Promise<void> {
  // Opening a file replaces the current board — ask first (same protection as "New / clear").
  if (!isEmptyBoard() && !confirm(`Replace the current board with "${file.name}"?`)) return;
  try {
    logWarnings(await openFile(file, viewer));
  } catch (err) {
    showToast(`Could not open file: ${(err as Error).message}`, 'error');
  }
}

// --- JSON/DSL export panel ---
const overlay = document.getElementById('output');
const outTitle = document.getElementById('output-title');
const outText = document.getElementById('output-text') as HTMLTextAreaElement | null;
function openOutput(title: string, text: string): void {
  if (!overlay || !outTitle || !outText) return;
  outTitle.textContent = title;
  outText.value = text;
  overlay.hidden = false;
  outText.focus();
  outText.select();
}
function exportSvg(): void {
  deselect();
  void viewer.saveSVG().then(({ svg }) => {
    downloadText(svg, 'event-storming-board.svg', 'image/svg+xml');
  });
}
function exportPng(options: { scale?: number; transparent?: boolean } = {}): void {
  deselect();
  void viewer.saveSVG().then(async ({ svg }) => {
    downloadBlob(await svgToPng(svg, options), 'event-storming-board.png');
  });
}

// --- Wire up menu items ---
onMenu('m-open', pickFile);
onMenu('m-example', showExample);
onMenu('m-new', () => {
  if (isEmptyBoard() || confirm('Discard the current board and start an empty one?')) clearCanvas();
});
onMenu('m-undo', () => viewer.undo());
onMenu('m-redo', () => viewer.redo());
onMenu('m-json', () => openOutput('Export · JSON', JSON.stringify(viewer.exportMap(), null, 2)));
onMenu('m-dsl', () => openOutput('Export · DSL (.storm)', viewer.exportDSL()));
onMenu('m-svg', exportSvg);
onMenu('m-png', () => exportPng());
onMenu('m-png-transparent', () => exportPng({ scale: 4, transparent: true }));

// --- Landing (start-screen) buttons ---
document.getElementById('btn-new')?.addEventListener('click', () => {
  /* Canvas is already empty here — just leave the landing and reveal the working chrome. */
  hasStarted = true;
  updateLanding();
});
document.getElementById('btn-example')?.addEventListener('click', () => {
  hasStarted = true;
  showExample();
});

// --- Close/copy the output panel ---
document.getElementById('output-close')?.addEventListener('click', () => {
  if (overlay) overlay.hidden = true;
});
overlay?.addEventListener('click', (e) => {
  if (e.target === overlay) overlay.hidden = true;
});
document.getElementById('output-copy')?.addEventListener('click', () => {
  if (!outText) return;
  void navigator.clipboard?.writeText(outText.value);
  outText.select();
  showToast('Copied to clipboard', 'success');
});

// --- Share ---
document.getElementById('btn-share')?.addEventListener('click', () => {
  void (async () => {
    try {
      const dsl = viewer.exportDSL();
      const url = await shareUrl(dsl);
      await writeHashMap(dsl);
      await navigator.clipboard?.writeText(url);
      showToast('Share link copied to clipboard', 'success');
    } catch {
      showToast('Could not create the share link', 'error');
    }
  })();
});

// --- Zoom controls (bottom right) + shortcuts ---
const zoomScroll = viewer.get('zoomScroll') as { stepZoom(delta: number): void };
const canvasService = viewer.get('canvas') as { zoom(): number };
const zoomLevelBtn = document.getElementById('z-level');
function updateZoomLevel(): void {
  if (zoomLevelBtn) zoomLevelBtn.textContent = `${Math.round(canvasService.zoom() * 100)}%`;
}
viewer.on('canvas.viewbox.changed', updateZoomLevel);
document.getElementById('z-in')?.addEventListener('click', () => zoomScroll.stepZoom(1));
document.getElementById('z-out')?.addEventListener('click', () => zoomScroll.stepZoom(-1));
zoomLevelBtn?.addEventListener('click', fitView);
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')) return;
  if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    zoomScroll.stepZoom(1);
  } else if (e.key === '-') {
    e.preventDefault();
    zoomScroll.stepZoom(-1);
  } else if (e.key === '0') {
    e.preventDefault();
    fitView();
  }
});

// --- Drag & drop (over the whole stage, including over the empty state) ---
const stage = document.querySelector('.app-stage');
let dragDepth = 0;
stage?.addEventListener('dragenter', (e) => {
  if ((e as DragEvent).dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    dragDepth++;
    stage.classList.add('drag-over');
  }
});
stage?.addEventListener('dragover', (e) => {
  if ((e as DragEvent).dataTransfer?.types.includes('Files')) e.preventDefault();
});
stage?.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    stage.classList.remove('drag-over');
  }
});
stage?.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  stage.classList.remove('drag-over');
  const file = (e as DragEvent).dataTransfer?.files?.[0];
  if (file) void load(file);
});

// --- Startup: load the board from the URL hash, otherwise an EMPTY canvas (no auto-example) ---
const initial = await readHashMap();
if (initial) {
  const { warnings } = await viewer.importDSL(initial);
  logWarnings(warnings);
} else {
  await viewer.importMap(createEmptyBoard('New board'));
}

// Pasting a shared link into an already-open tab: adopt the hash change.
// (writeHashMap uses history.replaceState and fires NO hashchange -> no loop.)
window.addEventListener('hashchange', () => {
  void (async () => {
    const dsl = await readHashMap();
    if (dsl && dsl !== viewer.exportDSL()) {
      const { warnings } = await viewer.importDSL(dsl);
      logWarnings(warnings);
    }
  })();
});
