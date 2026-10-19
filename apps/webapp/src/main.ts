// Geist and Geist Mono (Miragon's typefaces, SIL OFL), self-hosted: no font CDN (offline, GDPR).
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
// The renderer's stylesheet brings the vendored tokens, diagram-js.css, the canvas mapping and the
// shortcuts dialog; the chrome's stylesheet comes last.
import '@miragon/event-storming-renderer/assets/event-storming.css';
import '@miragon/modeler-shell/shell.css';
import {
  Modeler,
  boardMenu,
  createShortcutsDialog,
  importWarningText,
  type BoardBounds,
  type BoardLevels,
  type ImportWarning,
  type TypeCaptions,
} from '@miragon/event-storming-renderer';
import { createEmptyBoard } from '@miragon/event-storming-schema-model';
import {
  TEXT_FIELD_SELECTOR,
  commandKeyLabel,
  defaultMessages,
  detectPlatform,
  formatNumber,
  isUndoRedoKey,
  mountShell,
  problemSummary,
  type ToastHandle,
} from '@miragon/modeler-shell';
import { connectDiagramJs, shellModule } from '@miragon/modeler-shell/diagram-js';
import { copyTextWhenReady } from './clipboard.js';
import { EXAMPLE_BOARD } from './example.js';
import { boardFileName, type DownloadKind } from './file-names.js';
import {
  downloadBlob,
  downloadText,
  importBoardFile,
  openFile,
  readBoardFile,
  svgToPng,
} from './io.js';
import { readTypeCaptionsVisible, writeTypeCaptionsVisible } from './preferences.js';
import { importWarningsText, problemItems } from './problems.js';
import { hashHoldsBoard, readHashMap, shareUrl, writeHashMap } from './share.js';
import { THEMES } from './themes.js';

interface DiagramElement {
  id: string;
  parent?: unknown;
  waypoints?: unknown;
}
interface ElementRegistryLike {
  getAll(): DiagramElement[];
  get(id: string): DiagramElement | undefined;
}
interface SelectionLike {
  get(): DiagramElement[];
  select(elements: DiagramElement | DiagramElement[] | null): void;
}
interface CanvasLike {
  scrollToElement(element: DiagramElement): void;
}

const APP_NAME = 'Event Storming Modeler';
const BOARD_NAME = 'Event Storming board';
const NEW_BOARD_TITLE = 'New board';
const REPOSITORY_URL = 'https://github.com/Miragon/event-storming-modeler';
/** Extensions for the file picker and the drop; the MIME types decide during a drag (guide §9). */
const BOARD_FILE_TYPES = ['.storm', '.json', '.txt', 'application/json', 'text/plain'];
const CHECK_BOARD_FILE = 'Check that it contains a valid Event Storming board.';
const BROKEN_LINK_TEXT =
  "Couldn't read the board in this link. Check that you copied the whole link.";

const app = document.getElementById('app');
if (!app) throw new Error('index.html has no #app root.');

// 1. The diagram first: the Event Storming keyboard listens on document and must run before the
//    chrome's key listener, and the Modeler builds its diagram lazily on the first get(). The web
//    app keeps the canvas's own undo and redo keys.
const modeler = new Modeler({
  width: '100%',
  height: '100%',
  additionalModules: [shellModule],
  // Where Enter or Space on a creating palette entry places the sticky (guide §5.5).
  freeRectInsets: () => shell.fitInsets(),
});
modeler.get('canvas');
const registry = modeler.get<ElementRegistryLike>('elementRegistry');
const commandStack = modeler.get<{ canUndo(): boolean }>('commandStack');
const selection = modeler.get<SelectionLike>('selection');
const canvas = modeler.get<CanvasLike>('canvas');
const boardBounds = modeler.get<BoardBounds>('boardBounds');
const levels = modeler.get<BoardLevels>('eventStormingModeling');
const typeCaptions = modeler.get<TypeCaptions>('eventStormingViewOptions');
// A view preference of this browser: applied before the first import, never part of the link.
if (readTypeCaptionsVisible() === false) typeCaptions.setTypeCaptionsVisible(false);
Object.assign(globalThis as Record<string, unknown>, {
  __eventStormingViewer: modeler,
  __eventStormingIo: { openFile, svgToPng },
});

const platform = detectPlatform(navigator);
const openKey = commandKeyLabel('O', platform, defaultMessages.keyNames);
const saveKey = commandKeyLabel('S', platform, defaultMessages.keyNames);

// 2. The chrome around it: the whole web column of guide §5.2.
const shell = mountShell(app, {
  host: 'web',
  canvas: modeler.container,
  lang: 'en',
  platform,
  themes: THEMES,
  messages: { canvas: BOARD_NAME },
  primary: { onSelect: () => share() },
  legal: { links: [{ label: 'GitHub', href: REPOSITORY_URL }] },
  file: {
    newDiagram: { onSelect: () => void newDiagram() },
    open: { onSelect: () => pickFile(), shortcut: openKey },
    showExample: { onSelect: () => void showExample() },
  },
  menu: boardMenu({
    levels,
    typeCaptions,
    onTypeCaptionsToggled: writeTypeCaptionsVisible,
    exports: {
      png: { onSelect: () => void exportPicture('png') },
      svg: { onSelect: () => void exportPicture('svg') },
      transparentPng: { onSelect: () => void exportPicture('png-transparent') },
      json: { onSelect: () => exportBoardText('json') },
      storm: { onSelect: () => exportBoardText('storm'), shortcut: saveKey },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
  }),
  problems: { onSelectItem: (item) => selectElement(item.elementId) },
  emptyState: {
    title: APP_NAME,
    text: 'Start a new diagram, or explore the example.',
    komet: '/miragon-komet-blau.svg',
    onNewDiagram: () => void newDiagram(),
    onShowExample: () => void showExample(),
    // The same types the reject toast names (the accept list's extensions).
    dropHint: 'Or drop a .storm, .json, or .txt file here',
  },
  dropZone: {
    accept: BOARD_FILE_TYPES,
    onDrop: ([file]) => {
      if (file) void openBoardFile(file);
    },
  },
});
const shortcutsDialog = createShortcutsDialog(shell, { fileKeys: true });
modeler.on('diagram.destroy', () => shortcutsDialog.destroy());

// 3. Viewport, palette skin, keys. Cheap tests only: the chrome asks on every content change.
const isEmpty = (): boolean =>
  !registry.getAll().some((element) => element.parent && !element.waypoints);
const connection = connectDiagramJs(shell, modeler, {
  isEmpty,
  // No padding of its own: the chrome's fit insets are the only margin (guide §5.9).
  contentBounds: () => (isEmpty() ? undefined : boardBounds.contentBounds(0)),
});
const { viewport } = connection;

// ---------------------------------------------------------------------------
// Documents: every new board opens like the first (guide §5.9)
// ---------------------------------------------------------------------------

type BoardLoad = () => Promise<readonly ImportWarning[]>;

const importText =
  (text: string): BoardLoad =>
  async () =>
    (await modeler.importDSL(text)).warnings;

/** Whether the board has stickies, drawings or arrows (the title and level alone do not count). */
function boardIsEmpty(): boolean {
  const board = modeler.exportMap();
  return board.elements.length === 0 && board.edges.length === 0;
}

/**
 * Import findings go to the problems pill and its list. A toast points at them after an import the
 * user started (open, drop, example, link), never after one that restores a board (guide §9).
 */
function reportWarnings(warnings: readonly ImportWarning[], announce: boolean): void {
  const items = problemItems(warnings, (id) => registry.get(id) !== undefined);
  shell.setProblems(problemSummary(items));
  for (const warning of warnings)
    console.warn(`[event-storming-import] ${importWarningText(warning)}`);
  if (!announce || items.length === 0) return;
  const pill = shell.messages.problems(items.length, formatNumber(items.length, shell.lang));
  shell.toast({ status: 'warning', text: importWarningsText(items.length, pill) });
}

async function openDocument(load: BoardLoad, announce: boolean): Promise<void> {
  viewport.newDocument();
  let warnings: readonly ImportWarning[];
  try {
    warnings = await load();
  } finally {
    viewport.afterImport();
  }
  shell.setEmptyState(false);
  shell.menu.refresh();
  updateDocumentTitle();
  reportWarnings(warnings, announce);
}

/** The board's title in the tab (guide §5.4: the web app's title names the file), else the app. */
function updateDocumentTitle(): void {
  const title = shell.isEmptyStateShown() ? undefined : boardTitle()?.trim();
  document.title = title && title !== NEW_BOARD_TITLE ? `${title} · ${APP_NAME}` : APP_NAME;
}

interface ReplaceUndo {
  readonly toast: ToastHandle;
  run(): void;
}

let replaceUndo: ReplaceUndo | undefined;

/** An undo offer would bring back the replaced board and silently drop what came after it. */
function withdrawReplaceUndo(): void {
  replaceUndo?.toast.dismiss();
  replaceUndo = undefined;
}

/**
 * Replacing a board clears the canvas history, so instead of asking first (guide §9) every
 * replacement keeps the previous board as text and offers it back: "Board replaced · Undo", and
 * Cmd/Ctrl+Z while the canvas has nothing else to undo (the toast's button is far down the tab order).
 */
async function replaceBoard(load: BoardLoad): Promise<void> {
  const previous = boardIsEmpty() ? undefined : modeler.exportDSL();
  await openDocument(load, true);
  withdrawReplaceUndo();
  if (previous === undefined || previous === modeler.exportDSL()) return;
  const undo = (): void => {
    if (replaceUndo === offer) replaceUndo = undefined;
    void openDocument(importText(previous), false);
  };
  const offer: ReplaceUndo = {
    toast: shell.toast({
      status: 'info',
      text: 'Board replaced',
      action: { label: 'Undo', onSelect: undo },
    }),
    run: () => {
      offer.toast.dismiss();
      undo();
    },
  };
  replaceUndo = offer;
}

function newDiagram(): Promise<void> {
  return replaceBoard(
    async () => (await modeler.importMap(createEmptyBoard(NEW_BOARD_TITLE))).warnings,
  );
}

function showExample(): Promise<void> {
  return replaceBoard(importText(EXAMPLE_BOARD));
}

async function openBoardFile(file: File): Promise<void> {
  try {
    const boardFile = await readBoardFile(file);
    await replaceBoard(() => importBoardFile(boardFile, modeler));
  } catch (error) {
    console.error('[event-storming-open]', error);
    shell.toast({
      status: 'danger',
      text: `Couldn't read “${file.name}”. ${CHECK_BOARD_FILE}`,
    });
  }
}

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = BOARD_FILE_TYPES.join(',');
fileInput.hidden = true;
document.body.append(fileInput);
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) void openBoardFile(file);
});

function pickFile(): void {
  fileInput.click();
}

function selectElement(id: string | undefined): void {
  const element = id ? registry.get(id) : undefined;
  if (!element) return;
  selection.select(element);
  canvas.scrollToElement(element);
}

// ---------------------------------------------------------------------------
// Share and export
// ---------------------------------------------------------------------------

/** Copies the link inside the click (Safari keeps the gesture only there), shows it in the URL. */
function share(): void {
  const dsl = modeler.exportDSL();
  const copied = copyTextWhenReady(shareUrl(dsl));
  void (async () => {
    try {
      await writeHashMap(dsl);
      await copied;
      shell.toast({ status: 'success', text: 'Link copied' });
    } catch (error) {
      console.error('[event-storming-share]', error);
      shell.toast({
        status: 'danger',
        text: "Couldn't copy the link. Copy it from the address bar instead.",
      });
    }
  })();
}

function boardTitle(): string | undefined {
  return modeler.exportMap().config.title;
}

function selectedElements(): DiagramElement[] {
  return selection.get();
}

/** The picture shows the board, not the selection outlines; the selection comes back afterwards. */
async function withoutSelection<T>(task: () => Promise<T>): Promise<T> {
  const selected = selectedElements();
  selection.select(null);
  try {
    return await task();
  } finally {
    if (selected.length > 0) selection.select(selected);
  }
}

function announceExport(fileName: string): void {
  shell.toast({ status: 'success', text: `Exported ${fileName}.` });
}

async function exportPicture(kind: Extract<DownloadKind, 'png' | 'png-transparent' | 'svg'>) {
  const fileName = boardFileName(boardTitle(), kind);
  try {
    const { svg } = await withoutSelection(() => modeler.saveSVG());
    if (kind === 'svg') downloadText(svg, fileName, 'image/svg+xml');
    else {
      const options = kind === 'png' ? {} : { scale: 4, transparent: true };
      downloadBlob(await svgToPng(svg, options), fileName);
    }
    announceExport(fileName);
  } catch (error) {
    console.error('[event-storming-export]', error);
    shell.toast({
      status: 'danger',
      text:
        kind === 'svg'
          ? "Couldn't export the board as SVG. Try again."
          : "Couldn't export the board as PNG. Try again, or export it as SVG.",
    });
  }
}

function exportBoardText(kind: Extract<DownloadKind, 'json' | 'storm'>): void {
  const fileName = boardFileName(boardTitle(), kind);
  try {
    // The board's own order, not serializeBoard's canonical one: the importer stacks stickies in
    // array order, so a sorted export would reopen with overlapping stickies swapped.
    if (kind === 'json') {
      downloadText(JSON.stringify(modeler.exportMap(), null, 2), fileName, 'application/json');
    } else downloadText(modeler.exportDSL(), fileName, 'text/plain;charset=utf-8');
    announceExport(fileName);
  } catch (error) {
    console.error('[event-storming-export]', error);
    shell.toast({ status: 'danger', text: `Couldn't export ${fileName}. Try again.` });
  }
}

// ---------------------------------------------------------------------------
// The web app's own keys: Cmd/Ctrl+O opens a file, Cmd/Ctrl+S exports the .storm file,
// Cmd/Ctrl+Z takes back a replaced board
// ---------------------------------------------------------------------------

function isInTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches(TEXT_FIELD_SELECTOR) || target.isContentEditable)
  );
}

function modalOpen(): boolean {
  return document.querySelector('dialog:modal') !== null;
}

/** The canvas has nothing to undo after a replacement (the import cleared it): Cmd/Ctrl+Z takes the board back. */
function onUndoReplaceKey(event: KeyboardEvent): void {
  const offer = replaceUndo;
  if (!offer || event.shiftKey || event.isComposing || !isUndoRedoKey(event)) return;
  // Cmd/Ctrl+Y is redo; the typed letter decides (QWERTZ swaps the keys), as in isUndoRedoKey.
  const ascii = event.key.length === 1 && event.key.charCodeAt(0) < 0x80;
  if ((ascii ? event.key.toLowerCase() : event.code === 'KeyZ' ? 'z' : '') !== 'z') return;
  if (isInTextField(event.target) || modalOpen() || commandStack.canUndo()) return;
  event.preventDefault();
  if (!event.repeat) offer.run();
}

function onAppKey(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  onUndoReplaceKey(event);
  if (event.shiftKey) return;
  const key = event.key.toLowerCase();
  if ((key !== 'o' && key !== 's') || event.isComposing) return;
  // Never the browser's "Open file" or "Save page as" instead, also not over a dialog.
  event.preventDefault();
  if (event.repeat || modalOpen()) return;
  if (key === 'o') {
    pickFile();
    return;
  }
  // The start screen has no board yet to save (guide §8: only the card and the legal line).
  if (shell.isEmptyStateShown()) return;
  // A label being typed belongs in the file: leaving the field commits it.
  const active = document.activeElement;
  if (active instanceof HTMLElement && isInTextField(active)) active.blur();
  exportBoardText('storm');
}

// ---------------------------------------------------------------------------
// The link: every change is in the URL hash, a pasted link replaces the board
// ---------------------------------------------------------------------------

let urlTimer: ReturnType<typeof setTimeout> | undefined;
function syncUrlNow(): void {
  clearTimeout(urlTimer);
  urlTimer = undefined;
  // An empty board drops the hash: a clean URL, and an empty start stays shareable.
  if (boardIsEmpty()) history.replaceState(null, '', location.pathname + location.search);
  else void writeHashMap(modeler.exportDSL());
}
/**
 * Discrete edits (create, connect, move, delete) are written at once, so a fast reload keeps a
 * change just made. The debounce path is for high-frequency change sources, flushed on leaving.
 */
function onModelChanged(debounce = false): void {
  clearTimeout(urlTimer);
  if (debounce) urlTimer = setTimeout(syncUrlNow, 350);
  else syncUrlNow();
}
const flushUrl = (): void => {
  if (urlTimer !== undefined) syncUrlNow();
};

modeler.on('import.done', () => onModelChanged());
modeler.on<{ trigger?: string }>('commandStack.changed', (event) => {
  if (event.trigger !== 'clear') {
    // The first edit is a start as well; and an edit makes an open undo offer stale.
    shell.setEmptyState(false);
    withdrawReplaceUndo();
  }
  shell.menu.refresh(); // the level is undoable
  updateDocumentTitle();
  onModelChanged();
});

/** A link pasted into an open tab: writeHashMap uses replaceState and fires no hashchange. */
function onHashChange(): void {
  void (async () => {
    const dsl = await readHashMap();
    if (dsl === null) {
      if (hashHoldsBoard()) shell.toast({ status: 'danger', text: BROKEN_LINK_TEXT });
      return;
    }
    if (dsl !== modeler.exportDSL()) await replaceBoard(importText(dsl));
  })();
}

window.addEventListener('keydown', onAppKey);
window.addEventListener('hashchange', onHashChange);
window.addEventListener('beforeunload', flushUrl);
window.addEventListener('pagehide', flushUrl);

// ---------------------------------------------------------------------------
// Start: the board from the link, else the start screen on an empty board
// ---------------------------------------------------------------------------

const linked = await readHashMap();
if (linked !== null) await openDocument(importText(linked), true);
else {
  const brokenLink = hashHoldsBoard();
  await modeler.importMap(createEmptyBoard(NEW_BOARD_TITLE));
  viewport.afterImport(); // an empty board at 100 %
  shell.setEmptyState(true);
  updateDocumentTitle();
  if (brokenLink) shell.toast({ status: 'danger', text: BROKEN_LINK_TEXT });
}

let destroyed = false;

/** For the console and the e2e suite: the app's parts and its teardown, once it started. */
const eventStormingApp = {
  ready: true,
  shell,
  connection,
  destroy(): void {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener('keydown', onAppKey);
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('beforeunload', flushUrl);
    window.removeEventListener('pagehide', flushUrl);
    clearTimeout(urlTimer);
    fileInput.remove();
    connection.destroy();
    modeler.destroy();
    shell.destroy();
  },
};
Object.assign(globalThis as Record<string, unknown>, { __eventStormingApp: eventStormingApp });
