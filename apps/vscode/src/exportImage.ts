import * as vscode from 'vscode';

/**
 * Image export (SVG/PNG) to disk via a save dialog. The image is a plain picture of the board —
 * generic over the source URI so it works with or without a backing file.
 */
export async function exportImageToFile(
  sourceUri: vscode.Uri | undefined,
  format: 'svg' | 'png',
  data: string,
): Promise<void> {
  const options: vscode.SaveDialogOptions = {
    filters: format === 'svg' ? { 'SVG image': ['svg'] } : { 'PNG image': ['png'] },
  };
  const defaultUri = exportDefaultUri(sourceUri, format);
  if (defaultUri) options.defaultUri = defaultUri;
  const target = await vscode.window.showSaveDialog(options);
  if (!target) return;

  const bytes =
    format === 'svg' ? new TextEncoder().encode(data) : new Uint8Array(Buffer.from(data, 'base64'));
  await vscode.workspace.fs.writeFile(target, bytes);

  const action = await vscode.window.showInformationMessage(
    `Event Storming board exported as ${format.toUpperCase()}.`,
    'Reveal',
  );
  if (action === 'Reveal') void vscode.commands.executeCommand('revealFileInOS', target);
}

/** `<boardname>.<format>` next to the source file (if no file: in the first workspace folder). */
function exportDefaultUri(
  sourceUri: vscode.Uri | undefined,
  format: 'svg' | 'png',
): vscode.Uri | undefined {
  if (sourceUri && sourceUri.scheme === 'file') {
    // Strip the board extension so `board.storm` -> `board.svg`.
    const path = sourceUri.path.replace(/\.[^./]+$/i, '');
    return sourceUri.with({ path: `${path}.${format}` });
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, `event-storming-board.${format}`) : undefined;
}
