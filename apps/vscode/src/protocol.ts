/**
 * Message protocol between the extension host and the webview.
 *
 * Data flow (classic CustomTextEditor pattern):
 *  - Host -> webview: `init`/`update` with the current document text (Event Storming DSL).
 *  - Host -> webview: `problems` with the diagnostics summary for the problems pill.
 *  - Host -> webview: `command` when a Command Palette command targets the active board.
 *  - Webview -> host: `edit` after every graphical change (serialized DSL) -> WorkspaceEdit.
 *  - Webview -> host: `export` (SVG or JSON text, Base64 PNG) -> save dialog + write file.
 *  - Webview -> host: `showProblems` (pill) and `insertExample` (empty-file hint).
 *
 * Echo protection: the host suppresses re-import when a document change exactly matches the DSL
 * last sent by the webview (otherwise every own change would reset the canvas). The webview, in
 * turn, only sends an `edit` when the DSL actually differs from the last known text. The shell's
 * `modelerShell.appearance` messages arrive on the same window; the webview ignores unknown types.
 */

/** Board actions that exist both in the webview menu and as Command Palette commands. */
export type WebviewCommand =
  'fitView' | 'exportPng' | 'exportSvg' | 'exportPngTransparent' | 'exportJson';

/** What an export carries: SVG and JSON as text, the PNGs in Base64. */
export type ExportFormat = 'svg' | 'png' | 'png-transparent' | 'json';

export type HostToWebview =
  /** Initial population after `ready`. */
  | { type: 'init'; text: string }
  /** External document change (text editor, Git, undo, Insert example, …) -> re-import. */
  | { type: 'update'; text: string }
  /** Diagnostics of the document, for the problems pill. */
  | { type: 'problems'; count: number; errors: number }
  /** A command from the Command Palette for this board. */
  | { type: 'command'; name: WebviewCommand };

export type WebviewToHost =
  | { type: 'ready' }
  /** Graphical change -> apply to the document as a WorkspaceEdit. */
  | { type: 'edit'; text: string }
  /** Trigger an export (SVG and JSON = text, PNG = Base64). */
  | { type: 'export'; format: ExportFormat; data: string }
  | { type: 'error'; message: string }
  /** The problems pill was activated -> open the Problems view. */
  | { type: 'showProblems' }
  /** "Insert example" of the empty-file hint -> append the example as one document edit. */
  | { type: 'insertExample' };
