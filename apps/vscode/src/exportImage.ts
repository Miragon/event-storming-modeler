import * as vscode from 'vscode';
import { revealFileLabel } from '@miragon/modeler-shell/vscode/extension';

type ImageFormat = 'svg' | 'png';

/**
 * Image export (SVG/PNG) to disk via a save dialog. The image is a plain picture of the board —
 * generic over the source URI so it works with or without a backing file. The outcome is a host
 * notification (guide §13.5): the file name with a reveal action, or the error.
 */
export async function exportImageToFile(
  sourceUri: vscode.Uri | undefined,
  format: ImageFormat,
  data: string,
): Promise<void> {
  const options: vscode.SaveDialogOptions = {
    title: format === 'svg' ? 'Export as SVG' : 'Export as PNG',
    saveLabel: 'Export',
    filters: format === 'svg' ? { 'SVG image': ['svg'] } : { 'PNG image': ['png'] },
  };
  const defaultUri = exportDefaultUri(sourceUri, format);
  if (defaultUri) options.defaultUri = defaultUri;
  const target = await vscode.window.showSaveDialog(options);
  if (!target) return;

  const fileName = target.path.slice(target.path.lastIndexOf('/') + 1);
  const bytes =
    format === 'svg' ? new TextEncoder().encode(data) : new Uint8Array(Buffer.from(data, 'base64'));
  try {
    await vscode.workspace.fs.writeFile(target, bytes);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Could not export ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const reveal = revealFileLabel(process.platform);
  if ((await vscode.window.showInformationMessage(`Exported ${fileName}.`, reveal)) === reveal) {
    void vscode.commands.executeCommand('revealFileInOS', target);
  }
}

/** `<boardname>.<format>` next to the source file (if no file: in the first workspace folder). */
function exportDefaultUri(
  sourceUri: vscode.Uri | undefined,
  format: ImageFormat,
): vscode.Uri | undefined {
  if (sourceUri && sourceUri.scheme === 'file') {
    const path = sourceUri.path.replace(/\.[^./]+$/i, '');
    return sourceUri.with({ path: `${path}.${format}` });
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? vscode.Uri.joinPath(folder.uri, `event-storming-board.${format}`) : undefined;
}
