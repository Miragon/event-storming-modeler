import * as vscode from 'vscode';
import { EventStormingEditorProvider } from './EventStormingEditorProvider.js';
import { EMPTY_BOARD, EXAMPLE_BOARD } from './examples.js';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    EventStormingEditorProvider.register(context),
    vscode.commands.registerCommand('eventStorming.newBoard', () => createBoard(EMPTY_BOARD)),
    vscode.commands.registerCommand('eventStorming.newBoardFromExample', () =>
      createBoard(EXAMPLE_BOARD),
    ),
  );
}

export function deactivate(): void {
  /* nothing to do — all resources are tied to context.subscriptions */
}

/** A real file URI rather than an untitled doc is most robust for CustomTextEditor. */
async function createBoard(initial: string): Promise<void> {
  const options: vscode.SaveDialogOptions = {
    title: 'New Event Storming Board',
    saveLabel: 'Create board',
    filters: { 'Event Storming Board': ['storm'] },
  };
  const defaultUri = defaultBoardUri();
  if (defaultUri) options.defaultUri = defaultUri;

  const target = await vscode.window.showSaveDialog(options);
  if (!target) return;

  await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(initial));
  await vscode.commands.executeCommand(
    'vscode.openWith',
    target,
    EventStormingEditorProvider.viewType,
  );
}

function defaultBoardUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, 'untitled.storm') : undefined;
}
