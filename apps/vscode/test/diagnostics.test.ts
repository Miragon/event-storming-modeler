import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticSeverity, commands, vscodeMock } from './__mocks__/vscode';
import { boardDiagnostics } from '../src/diagnostics.js';
import { fakeDocument, installEchoingApplyEdit, openBoard, resetApplyEdit } from './fakes';

beforeEach(() => vscodeMock.reset());
afterEach(() => {
  resetApplyEdit();
  vi.restoreAllMocks();
});

const VALID = 'title A\nevent Paid [0, 0]\n';
const ONE_PROBLEM = 'title A\nevent Paid [0, 0]\n  Paid -> Missing\n';
const TWO_PROBLEMS = 'title A\nevent Paid [0, 0]\n  Paid -> Missing\nPaid -> Gone\n';

function collection() {
  const [only] = vscodeMock.diagnosticCollections();
  if (!only) throw new Error('No DiagnosticCollection was created.');
  return only;
}

describe('boardDiagnostics', () => {
  it('turns parser findings into warnings on their line, from the first character to the end', () => {
    const [diagnostic] = boardDiagnostics(ONE_PROBLEM);

    expect(diagnostic).toMatchObject({
      message: "This arrow points to “Missing”, which isn't on the board.",
      severity: DiagnosticSeverity.Warning,
      source: 'event-storming',
      range: { start: { line: 2, character: 2 }, end: { line: 2, character: 17 } },
    });
  });

  it('finds nothing in a valid board', () => {
    expect(boardDiagnostics(VALID)).toEqual([]);
  });
});

describe('EventStormingEditorProvider — diagnostics and the problems pill', () => {
  it('creates one collection named event-storming and fills it when the board opens', async () => {
    const doc = fakeDocument('/a.storm', ONE_PROBLEM);
    await openBoard(doc);

    expect(vscodeMock.diagnosticCollections()).toHaveLength(1);
    expect(collection().name).toBe('event-storming');
    expect(collection().get(doc.uri)).toHaveLength(1);
  });

  it('posts the problems summary right after init, with no errors', async () => {
    const h = await openBoard(fakeDocument('/a.storm', TWO_PROBLEMS));

    await h.receive({ type: 'ready' });

    expect(h.posted.slice(-2)).toEqual([
      { type: 'init', text: TWO_PROBLEMS },
      { type: 'problems', count: 2, errors: 0 },
    ]);
  });

  it('posts nothing about problems before the webview asked for init', async () => {
    const doc = fakeDocument('/a.storm', VALID);
    const h = await openBoard(doc);

    doc.set(ONE_PROBLEM);
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(h.messagesOfType('problems')).toEqual([]);
    expect(collection().get(doc.uri)).toHaveLength(1);
  });

  it('posts the summary again only when the count changes', async () => {
    const doc = fakeDocument('/a.storm', VALID);
    const h = await openBoard(doc);
    await h.receive({ type: 'ready' });

    doc.set(ONE_PROBLEM);
    vscodeMock.fireDidChangeTextDocument(doc);
    doc.set(`${ONE_PROBLEM}note Same count [0, 200]\n`);
    vscodeMock.fireDidChangeTextDocument(doc);
    doc.set(VALID);
    vscodeMock.fireDidChangeTextDocument(doc);

    expect(h.messagesOfType('problems')).toEqual([
      { type: 'problems', count: 0, errors: 0 },
      { type: 'problems', count: 1, errors: 0 },
      { type: 'problems', count: 0, errors: 0 },
    ]);
  });

  it('refreshes on the echo of a canvas edit too', async () => {
    const doc = fakeDocument('/a.storm', VALID);
    installEchoingApplyEdit(doc);
    const h = await openBoard(doc);
    await h.receive({ type: 'ready' });

    await h.receive({ type: 'edit', text: ONE_PROBLEM });

    expect(h.updates()).toEqual([]);
    expect(collection().get(doc.uri)).toHaveLength(1);
    expect(h.messagesOfType('problems').at(-1)).toEqual({ type: 'problems', count: 1, errors: 0 });
  });

  it("deletes the document's entry when the board editor closes", async () => {
    const doc = fakeDocument('/a.storm', ONE_PROBLEM);
    const h = await openBoard(doc);

    h.dispose();

    expect(collection().has(doc.uri)).toBe(false);
  });

  it('opens the Problems view when the pill is activated', async () => {
    const executeCommand = vi.spyOn(commands, 'executeCommand');
    const h = await openBoard(fakeDocument('/a.storm', ONE_PROBLEM));

    await h.receive({ type: 'showProblems' });

    expect(executeCommand).toHaveBeenCalledWith('workbench.actions.view.problems');
  });
});
