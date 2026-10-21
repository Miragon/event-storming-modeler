import './zod-jitless.js';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import {
  boardMenu,
  createCollaborativeModeler,
  createShortcutsDialog,
  type BoardBounds,
  type BoardLevels,
  type CollaborativeEventStormingModeler,
  type EventStormingReadOnly,
  type TypeCaptions,
} from '@miragon/event-storming-renderer';
import '@miragon/modeler-shell/shell.css';
import type { ShellHandle } from '@miragon/modeler-shell';
import { INVALID_STATUS_DELAY_MS } from '@miragon/modeler-shell/core';
import {
  connectDiagramJs,
  shellModule,
  type DiagramJsConnection,
} from '@miragon/modeler-shell/diagram-js';
import {
  mountVsCodeShell,
  persistView,
  readShellState,
} from '@miragon/modeler-shell/vscode/webview';
import type { HostToWebview, WebviewCommand, WebviewToHost } from '../protocol.js';
import { WEBVIEW_THEMES } from '../themes.js';
import { blobToBase64, svgToPng } from './io.js';
import { readTypeCaptionsVisible, writeTypeCaptionsVisible } from './state.js';

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState(): unknown;
  setState(state: unknown): void;
}
declare const acquireVsCodeApi: () => VsCodeApi;

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
  select(elements: DiagramElement[] | null): void;
}

const BOARD_NAME = 'Event Storming board';

const vscode = acquireVsCodeApi();
const storedShellState = readShellState(vscode);

// The diagram first: Event Storming's keyboard listens on document and must run before the shell's
// key listener, and the Modeler builds its diagram lazily on the first get(). Undo and redo keys
// stay unbound: VS Code's document history owns them (guide §13.5). The webview runs the same
// collaborative-modeler contract as every other host, so its imports are silent and fitted.
const collaborative = createCollaborativeModeler({
  additionalModules: [shellModule],
  undoRedoKeys: false,
  freeArea: { insets: () => shell.fitInsets() },
});
const modeler = collaborative.diagram;
modeler.get('canvas');
const registry = modeler.get<ElementRegistryLike>('elementRegistry');
const selection = modeler.get<SelectionLike>('selection');
const boardBounds = modeler.get<BoardBounds>('boardBounds');
const typeCaptions = modeler.get<TypeCaptions>('eventStormingViewOptions');
const levels = modeler.get<BoardLevels>('eventStormingModeling');
const canvasLock = modeler.get<EventStormingReadOnly>('eventStormingReadOnly');
if (readTypeCaptionsVisible(vscode) === false) typeCaptions.setTypeCaptionsVisible(false);

const app = document.getElementById('app');
if (!app) throw new Error('The webview HTML has no #app root.');

const shell = mountVsCodeShell(app, {
  themes: WEBVIEW_THEMES,
  canvas: modeler.container,
  messages: { canvas: BOARD_NAME },
  menu: boardMenu({
    levels,
    typeCaptions,
    onTypeCaptionsToggled: (visible) => writeTypeCaptionsVisible(vscode, visible),
    // The web app's Export group without its .storm export: here the file already is the .storm.
    exports: {
      png: { onSelect: () => void exportPng() },
      svg: { onSelect: () => void exportSvg() },
      transparentPng: { onSelect: () => void exportPngTransparent() },
      json: { onSelect: () => exportJson() },
    },
    showKeyboardShortcuts: () => shortcutsDialog.open(),
  }),
  problems: { onActivate: () => post({ type: 'showProblems' }) },
  emptyHint: { onInsertExample: () => post({ type: 'insertExample' }) },
});
const shortcutsDialog = createShortcutsDialog(shell);
modeler.on('diagram.destroy', () => shortcutsDialog.destroy());

// Cheap tests only: the shell asks on every content change, and exportMap() validates the board.
const isEmpty = (): boolean =>
  !registry.getAll().some((element) => element.parent && !element.waypoints);
const connection = connectDiagramJs(shell, modeler, {
  isEmpty,
  // No padding of its own: the shell's fit insets are the only margin.
  contentBounds: () => (isEmpty() ? undefined : boardBounds.contentBounds(0)),
});
const { viewport } = connection;
persistView(vscode, viewport);

// ---------------------------------------------------------------------------
// Two-way sync with the document
// ---------------------------------------------------------------------------

let lastText = '';
let initialized = false;

function post(message: WebviewToHost): void {
  vscode.postMessage(message);
}

/** Compares two DSL texts modulo line endings/trailing whitespace (= save transforms). */
function sameBoardText(a: string, b: string): boolean {
  return a.replace(/\r\n/g, '\n').trim() === b.replace(/\r\n/g, '\n').trim();
}

function selectedIds(): string[] {
  return selection.get().map((element) => element.id);
}

function reselect(ids: readonly string[]): void {
  const elements = ids
    .map((id) => registry.get(id))
    .filter((element): element is DiagramElement => element !== undefined);
  if (elements.length) selection.select(elements);
}

function showValidBoard(): void {
  canvasLock.setReadOnly(false);
  shell.setReadOnly(false);
  shell.setStatus(null);
}

function showInvalidBoard(): void {
  // Locked at once; the marks and the status box follow after 800ms without a valid import, so
  // typing in the text editor neither flickers nor re-announces the alert (guide §13.5).
  canvasLock.setReadOnly(true);
  shell.setReadOnly(true, { delayMs: INVALID_STATUS_DELAY_MS });
  shell.setStatus(
    { severity: 'danger', text: shell.messages.invalidFile(BOARD_NAME) },
    { delayMs: INVALID_STATUS_DELAY_MS },
  );
}

/**
 * Loads `text` into the modeler. The first import takes the stored view or fits; every later one
 * (a host undo, the text editor, Git) keeps viewbox and selection. An update that describes the
 * board the canvas already shows (only whitespace/EOL differ, e.g. `insertFinalNewline` on save)
 * is not re-imported at all.
 */
async function importText(text: string): Promise<void> {
  const first = !initialized;
  if (!first && sameBoardText(text, collaborative.exportText())) {
    lastText = text;
    showValidBoard();
    return;
  }
  const keep = first ? undefined : viewport.getViewbox();
  const selected = first ? [] : selectedIds();
  try {
    await collaborative.importText(text);
    lastText = text;
    showValidBoard();
    if (keep) viewport.restore(keep);
    else if (first && storedShellState.view) viewport.setState(storedShellState.view);
    reselect(selected);
    viewport.afterImport();
    shell.menu.refresh();
  } catch {
    showInvalidBoard();
  } finally {
    initialized = true;
  }
}

// Strictly serialized: init/update arrive as un-awaited messages, and two quick updates (several
// undos) must not import concurrently and finish in the wrong order.
let importChain: Promise<void> = Promise.resolve();
function enqueueImport(text: string): Promise<void> {
  importChain = importChain
    .then(() => importText(text))
    .catch((error: unknown) => console.error('Event Storming import failed', error));
  return importChain;
}

/** Graphical change -> serialize DSL and (only on a real difference) report it to the host. */
function pushEdit(): void {
  // Before the first import the canvas does not show the document yet; read-only: it shows the
  // last valid board. Either way an edit would overwrite text the canvas never saw.
  if (!initialized || shell.isReadOnly()) return;
  const text = collaborative.exportText();
  if (text === lastText) return;
  lastText = text;
  post({ type: 'edit', text });
}

collaborative.onContentChanged(pushEdit);
modeler.on('commandStack.changed', () => shell.menu.refresh());

// ---------------------------------------------------------------------------
// Export (the webview rasterizes/serializes; the host shows the save dialog)
// ---------------------------------------------------------------------------

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The picture shows the board, not the current selection outlines. */
async function withoutSelection<T>(task: () => Promise<T>): Promise<T> {
  const ids = selectedIds();
  selection.select(null);
  try {
    return await task();
  } finally {
    reselect(ids);
  }
}

async function exportSvg(): Promise<void> {
  try {
    const { svg } = await withoutSelection(() => modeler.saveSVG());
    post({ type: 'export', format: 'svg', data: svg });
  } catch (error) {
    post({ type: 'error', message: `Could not export the board as SVG: ${messageOf(error)}` });
  }
}

async function exportPng(): Promise<void> {
  try {
    const { svg } = await withoutSelection(() => modeler.saveSVG());
    post({ type: 'export', format: 'png', data: await blobToBase64(await svgToPng(svg)) });
  } catch (error) {
    post({ type: 'error', message: `Could not export the board as PNG: ${messageOf(error)}` });
  }
}

/** Four times the size, without the paper (slides, documents), as in the web app. */
async function exportPngTransparent(): Promise<void> {
  try {
    const { svg } = await withoutSelection(() => modeler.saveSVG());
    const png = await svgToPng(svg, 4, true);
    post({ type: 'export', format: 'png-transparent', data: await blobToBase64(png) });
  } catch (error) {
    post({ type: 'error', message: `Could not export the board as PNG: ${messageOf(error)}` });
  }
}

/** The board's JSON in its own element order, as the web app exports it. */
function exportJson(): void {
  try {
    post({ type: 'export', format: 'json', data: JSON.stringify(modeler.exportMap(), null, 2) });
  } catch (error) {
    post({ type: 'error', message: `Could not export the board as JSON: ${messageOf(error)}` });
  }
}

// ---------------------------------------------------------------------------
// Messages from the extension host
// ---------------------------------------------------------------------------

const COMMANDS: Readonly<Record<WebviewCommand, () => void>> = {
  fitView: () => viewport.fit(),
  exportPng: () => void exportPng(),
  exportSvg: () => void exportSvg(),
  exportPngTransparent: () => void exportPngTransparent(),
  exportJson: () => exportJson(),
};

function isHostMessage(data: unknown): data is HostToWebview {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { type?: unknown }).type === 'string'
  );
}

let firstImportSettled: () => void = () => undefined;
const ready = new Promise<void>((resolve) => (firstImportSettled = resolve));

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isHostMessage(event.data)) return;
  const message = event.data;
  switch (message.type) {
    case 'init':
      void enqueueImport(message.text).then(firstImportSettled);
      break;
    case 'update':
      void enqueueImport(message.text);
      break;
    case 'problems':
      shell.setProblems({ count: message.count, errors: message.errors });
      break;
    case 'command':
      // Only own entries: a name such as "constructor" must not reach Object.prototype.
      if (Object.hasOwn(COMMANDS, message.name)) COMMANDS[message.name]();
      break;
  }
});

post({ type: 'ready' });

/** For test pages: the mounted parts, and `ready` once the first `init` import settled. */
export const webview: {
  shell: ShellHandle;
  modeler: CollaborativeEventStormingModeler;
  connection: DiagramJsConnection;
  ready: Promise<void>;
} = { shell, modeler: collaborative, connection, ready };
