import * as vscode from 'vscode';
import type { WebviewCommand } from './protocol.js';

export const WEBVIEW_COMMANDS: Readonly<Record<WebviewCommand, string>> = {
  fitView: 'eventStorming.fitView',
  exportPng: 'eventStorming.exportPng',
  exportSvg: 'eventStorming.exportSvg',
};

export const NO_BOARD_MESSAGE = 'Open an Event Storming board in the board editor first.';

/**
 * The Command Palette commands run the same handlers as the webview menu (guide §13.5): the
 * command only forwards its name to the focused board. `runCommand` returns false when no board
 * editor is focused (a keybinding of the user's own can still invoke the command then).
 */
export function registerWebviewCommands(
  runCommand: (name: WebviewCommand) => boolean,
): vscode.Disposable[] {
  return (Object.keys(WEBVIEW_COMMANDS) as WebviewCommand[]).map((name) =>
    vscode.commands.registerCommand(WEBVIEW_COMMANDS[name], () => {
      if (!runCommand(name)) void vscode.window.showInformationMessage(NO_BOARD_MESSAGE);
    }),
  );
}
