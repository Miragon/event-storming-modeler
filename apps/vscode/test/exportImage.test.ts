import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealFileLabel } from '@miragon/modeler-shell/vscode/extension';
import { Uri, commands, vscodeMock, window, workspace } from './__mocks__/vscode';
import { fakeDocument, openBoard, resetApplyEdit } from './fakes';

beforeEach(() => vscodeMock.reset());
afterEach(() => {
  resetApplyEdit();
  vi.restoreAllMocks();
});

const target = Uri.parse('file:/boards/checkout.png');

describe('EventStormingEditorProvider — export', () => {
  it('suggests the board name next to the file and writes the decoded PNG', async () => {
    const showSaveDialog = vi.spyOn(window, 'showSaveDialog').mockResolvedValue(target);
    const writeFile = vi.spyOn(workspace.fs, 'writeFile');
    const h = await openBoard(fakeDocument('/boards/checkout.storm', 'title A\n'));

    await h.receive({
      type: 'export',
      format: 'png',
      data: Buffer.from('png!').toString('base64'),
    });

    expect(showSaveDialog.mock.calls[0]![0]).toMatchObject({
      defaultUri: expect.objectContaining({ path: '/boards/checkout.png' }),
    });
    expect(Buffer.from(writeFile.mock.calls[0]![1]).toString()).toBe('png!');
  });

  it('notifies with the file name and a reveal action labelled like the platform', async () => {
    vi.spyOn(window, 'showSaveDialog').mockResolvedValue(target);
    const reveal = revealFileLabel(process.platform);
    const showInformationMessage = vi
      .spyOn(window, 'showInformationMessage')
      .mockResolvedValue(reveal);
    const executeCommand = vi.spyOn(commands, 'executeCommand');
    const h = await openBoard(fakeDocument('/boards/checkout.storm', 'title A\n'));

    await h.receive({ type: 'export', format: 'png', data: '' });

    expect(showInformationMessage).toHaveBeenCalledWith('Exported checkout.png.', reveal);
    expect(executeCommand).toHaveBeenCalledWith('revealFileInOS', target);
  });

  it('reports a failed write as an error notification, not as a success', async () => {
    vi.spyOn(window, 'showSaveDialog').mockResolvedValue(target);
    vi.spyOn(workspace.fs, 'writeFile').mockRejectedValue(new Error('disk full'));
    const showInformationMessage = vi.spyOn(window, 'showInformationMessage');
    const showErrorMessage = vi.spyOn(window, 'showErrorMessage');
    const h = await openBoard(fakeDocument('/boards/checkout.storm', 'title A\n'));

    await h.receive({ type: 'export', format: 'svg', data: '<svg/>' });

    expect(showErrorMessage).toHaveBeenCalledWith('Could not export checkout.png: disk full');
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('does nothing when the save dialog is cancelled', async () => {
    vi.spyOn(window, 'showSaveDialog').mockResolvedValue(undefined);
    const writeFile = vi.spyOn(workspace.fs, 'writeFile');
    const h = await openBoard(fakeDocument('/boards/checkout.storm', 'title A\n'));

    await h.receive({ type: 'export', format: 'svg', data: '<svg/>' });

    expect(writeFile).not.toHaveBeenCalled();
  });

  it('shows the error a failed export in the webview reports', async () => {
    const showErrorMessage = vi.spyOn(window, 'showErrorMessage');
    const h = await openBoard(fakeDocument('/boards/checkout.storm', 'title A\n'));

    await h.receive({ type: 'error', message: 'Could not export the board as PNG: boom' });

    expect(showErrorMessage).toHaveBeenCalledWith('Could not export the board as PNG: boom');
  });
});
