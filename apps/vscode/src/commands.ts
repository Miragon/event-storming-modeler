import * as vscode from 'vscode';
import type { WebviewCommand } from './protocol.js';

export const WEBVIEW_COMMANDS: Readonly<Record<WebviewCommand, string>> = {
  fitView: 'eventStorming.fitView',
  exportPng: 'eventStorming.exportPng',
  exportSvg: 'eventStorming.exportSvg',
};

export const NO_BOARD_MESSAGE = 'Open an Event Storming board in the board editor first.';

/** Text and board side by side (guide §13.5), from the editor title of either editor. */
export const OPEN_SOURCE_COMMAND = 'eventStorming.openSource';
export const OPEN_BOARD_COMMAND = 'eventStorming.openBoard';
export const BOARD_VIEW_TYPE = 'eventStorming.boardEditor';

/**
 * Editor title buttons pass the editor's resource; the Command Palette passes nothing, so the
 * caller falls back to the focused board or text editor.
 */
function resourceArgument(argument: unknown): vscode.Uri | undefined {
  return argument instanceof vscode.Uri ? argument : undefined;
}

export function registerSideBySideCommands(
  activeBoardUri: () => vscode.Uri | undefined,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(OPEN_SOURCE_COMMAND, (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? activeBoardUri();
      if (!uri) return void vscode.window.showInformationMessage(NO_BOARD_MESSAGE);
      return vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        'default',
        vscode.ViewColumn.Beside,
      );
    }),
    vscode.commands.registerCommand(OPEN_BOARD_COMMAND, (argument?: unknown) => {
      const uri = resourceArgument(argument) ?? vscode.window.activeTextEditor?.document.uri;
      if (!uri) return undefined;
      return vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        BOARD_VIEW_TYPE,
        vscode.ViewColumn.Beside,
      );
    }),
  ];
}

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
