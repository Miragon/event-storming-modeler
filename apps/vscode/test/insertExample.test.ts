import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vscodeMock } from './__mocks__/vscode';
import { EMPTY_BOARD, withExampleInserted } from '../src/examples.js';
import { fakeDocument, installEchoingApplyEdit, openBoard, resetApplyEdit } from './fakes';

beforeEach(() => vscodeMock.reset());
afterEach(() => resetApplyEdit());

describe('EventStormingEditorProvider — Insert example', () => {
  it('writes the example as ONE WorkspaceEdit with one replacement (one undo step)', async () => {
    const doc = fakeDocument('/a.storm', EMPTY_BOARD);
    const applied = installEchoingApplyEdit(doc);
    const h = await openBoard(doc);

    await h.receive({ type: 'insertExample' });

    expect(applied).toHaveLength(1);
    expect(applied[0]!.edits).toHaveLength(1);
    expect(doc.getText()).toBe(withExampleInserted(EMPTY_BOARD));
  });

  it('leaves the existing lines untouched: the edit only appends', async () => {
    const original = '# kick-off notes\ntitle Checkout\n';
    const doc = fakeDocument('/a.storm', original);
    const applied = installEchoingApplyEdit(doc);
    const h = await openBoard(doc);

    await h.receive({ type: 'insertExample' });

    const [change] = applied[0]!.edits;
    expect(change!.range.start).toMatchObject({ line: 2, character: 0 });
    expect(change!.range.end).toMatchObject({ line: 2, character: 0 });
    expect(doc.getText().startsWith(original)).toBe(true);
  });

  it('is not an echo: the webview gets the new text as an update, imports it and fits', async () => {
    const doc = fakeDocument('/a.storm', EMPTY_BOARD);
    installEchoingApplyEdit(doc);
    const h = await openBoard(doc);

    await h.receive({ type: 'insertExample' });

    expect(h.updates()).toEqual([withExampleInserted(EMPTY_BOARD)]);
  });
});
