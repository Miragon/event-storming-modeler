import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { type WorkspaceEdit, workspace, vscodeMock } from './__mocks__/vscode';
import { fakeDocument, installEchoingApplyEdit, openBoard, resetApplyEdit } from './fakes';

/**
 * Characterization of the text-editor host's echo protection: graphical edits the webview produces
 * come back as `onDidChangeTextDocument` and MUST be swallowed (not re-imported), while genuinely
 * external edits MUST reach the webview exactly once. Verified black-box via posted messages, since
 * the pending echoes are private.
 */

beforeEach(() => vscodeMock.reset());
afterEach(() => {
  resetApplyEdit();
  vi.restoreAllMocks();
});

describe('EventStormingEditorProvider — echo protection', () => {
  it('posts init with the document text on `ready`', async () => {
    const doc = fakeDocument('/a.storm', 'title A\n');
    const h = await openBoard(doc);

    await h.receive({ type: 'ready' });

    expect(h.posted).toContainEqual({ type: 'init', text: 'title A\n' });
  });

  it('swallows the echo of the webview‑s own edit (no `update` posted back)', async () => {
    const doc = fakeDocument('/a.storm', 'title A\n');
    installEchoingApplyEdit(doc);
    const h = await openBoard(doc);

    await h.receive({ type: 'edit', text: 'title B\n' });

    expect(doc.getText()).toBe('title B\n');
    expect(h.updates()).toEqual([]);
  });

  it('suppresses BOTH echoes for two edits in quick succession', async () => {
    const doc = fakeDocument('/a.storm', 'title A\n');
    installEchoingApplyEdit(doc);
    const h = await openBoard(doc);

    await h.receive({ type: 'edit', text: 'title B\n' });
    await h.receive({ type: 'edit', text: 'title C\n' });

    expect(doc.getText()).toBe('title C\n');
    expect(h.updates()).toEqual([]);
  });

  it('suppresses the echoes of edits sent without waiting for each other', async () => {
    const doc = fakeDocument('/a.storm', 'title A\n\nevent One [0, 0]\n');
    installEchoingApplyEdit(doc);
    const h = await openBoard(doc);

    await Promise.all([
      h.receive({ type: 'edit', text: 'title A\n\nevent One [0, 0]\nevent Two [100, 0]\n' }),
      h.receive({ type: 'edit', text: 'title B\n\nevent One [0, 0]\nevent Two [100, 0]\n' }),
    ]);

    expect(doc.getText()).toBe('title B\n\nevent One [0, 0]\nevent Two [100, 0]\n');
    expect(h.updates()).toEqual([]);
  });

  it('recognizes the echo when the document uses CRLF line breaks', async () => {
    const doc = fakeDocument('/a.storm', 'title A\r\nevent One [0, 0]\r\n');
    installEchoingApplyEdit(doc);
    workspace.applyEdit = ((original) => (edit: WorkspaceEdit) => {
      for (const change of edit.edits) change.text = change.text.replace(/\n/g, '\r\n');
      return original(edit);
    })(workspace.applyEdit);
    const h = await openBoard(doc);

    await h.receive({ type: 'edit', text: 'title B\nevent One [0, 0]\n' });

    expect(doc.getText()).toBe('title B\r\nevent One [0, 0]\r\n');
    expect(h.updates()).toEqual([]);
  });

  it('forwards a genuinely external change as exactly one `update`', async () => {
    const doc = fakeDocument('/a.storm', 'title A\n');
    const h = await openBoard(doc);

    doc.set('title EXTERNAL\n');
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(h.updates()).toEqual(['title EXTERNAL\n']);
  });

  it('does not applyEdit for a no-op edit (text equals current document)', async () => {
    const doc = fakeDocument('/a.storm', 'title A\n');
    const applyEdit = vi.fn((_edit: WorkspaceEdit) => Promise.resolve(true));
    workspace.applyEdit = applyEdit;
    const h = await openBoard(doc);

    await h.receive({ type: 'edit', text: 'title A\n' });

    expect(applyEdit).not.toHaveBeenCalled();
  });

  it('does NOT suppress when applyEdit fails (write rejected -> echo still forwarded)', async () => {
    const doc = fakeDocument('/a.storm', 'title A\n');
    workspace.applyEdit = (_edit: WorkspaceEdit) => Promise.resolve(false); // e.g. read-only file
    const h = await openBoard(doc);

    await h.receive({ type: 'edit', text: 'title B\n' });
    // The write failed, so the entry was removed; a later change carrying that text is NOT an echo.
    doc.set('title B\n');
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(h.updates()).toEqual(['title B\n']);
  });

  it('posts nothing for a change event without content changes (save, dirty state)', async () => {
    const doc = fakeDocument('/a.storm', 'title A\n');
    const h = await openBoard(doc);

    vscodeMock.fireDidChangeTextDocument(doc, []);

    expect(h.updates()).toEqual([]);
  });

  it('ignores changes of other documents', async () => {
    const doc = fakeDocument('/a.storm', 'title A\n');
    const other = fakeDocument('/b.storm', 'title B\n');
    const h = await openBoard(doc);

    vscodeMock.fireDidChangeTextDocument(other);

    expect(h.updates()).toEqual([]);
  });
});

describe('EventStormingEditorProvider — minimal edits', () => {
  it('writes ONE WorkspaceEdit per canvas change, touching only the changed lines', async () => {
    const doc = fakeDocument('/a.storm', 'title A\n\nevent One [0, 0]\nevent Two [100, 0]\n');
    const applied = installEchoingApplyEdit(doc);
    const h = await openBoard(doc);

    await h.receive({ type: 'edit', text: 'title A\n\nevent One [40, 0]\nevent Two [100, 0]\n' });

    expect(applied).toHaveLength(1);
    expect(applied[0]!.edits).toHaveLength(1);
    expect(applied[0]!.edits[0]).toMatchObject({
      range: { start: { line: 2, character: 0 }, end: { line: 3, character: 0 } },
      text: 'event One [40, 0]\n',
    });
  });
});
