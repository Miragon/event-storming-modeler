import * as vscode from 'vscode';
import { EventStormingEditorProvider } from './EventStormingEditorProvider.js';

const EMPTY_BOARD = 'title New board\n';

/** Order-checkout example (identical to the demo webapp), as a starting point. */
const EXAMPLE_BOARD = `title Order Checkout

actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [420, 290]
event Order Placed [620, 300]
policy When order placed, ship it [800, 300]
command Ship Order [980, 300]
event Order Shipped [1160, 300]
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
Order -> Order Shipped
`;

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
