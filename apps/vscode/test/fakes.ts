import type * as vscode from 'vscode';
import {
  Disposable,
  EventEmitter,
  Uri,
  type Range,
  type WorkspaceEdit,
  vscodeMock,
  workspace,
} from './__mocks__/vscode';
import { EventStormingEditorProvider } from '../src/EventStormingEditorProvider.js';
import type { HostToWebview, WebviewToHost } from '../src/protocol.js';

export interface FakeDoc {
  uri: Uri;
  getText(): string;
  set(text: string): void;
}

export function fakeDocument(path: string, text: string): FakeDoc {
  let current = text;
  return {
    uri: Uri.parse(`file:${path}`),
    getText: () => current,
    set: (next: string) => (current = next),
  };
}

/** The offset of a zero-based line/character position, honouring the text's own line breaks. */
function offsetOf(text: string, line: number, character: number): number {
  let offset = 0;
  for (let index = 0; index < line; index++) {
    const lineBreak = text.indexOf('\n', offset);
    if (lineBreak < 0) return text.length;
    offset = lineBreak + 1;
  }
  return offset + character;
}

export function applyRangeEdit(text: string, range: Range, replacement: string): string {
  const start = offsetOf(text, range.start.line, range.start.character);
  const end = offsetOf(text, range.end.line, range.end.character);
  return text.slice(0, start) + replacement + text.slice(end);
}

/** A realistic `applyEdit`: writes the edit into the doc and fires the (echo) change event. */
export function installEchoingApplyEdit(doc: FakeDoc): WorkspaceEdit[] {
  const applied: WorkspaceEdit[] = [];
  workspace.applyEdit = (edit: WorkspaceEdit) => {
    applied.push(edit);
    for (const change of edit.edits)
      doc.set(applyRangeEdit(doc.getText(), change.range, change.text));
    vscodeMock.fireDidChangeTextDocument(doc);
    return Promise.resolve(true);
  };
  return applied;
}

export function resetApplyEdit(): void {
  workspace.applyEdit = (_edit: WorkspaceEdit) => Promise.resolve(true);
}

export interface FakePanel {
  panel: vscode.WebviewPanel;
  webview: { html: string; options: unknown };
  posted: unknown[];
  updates(): string[];
  messagesOfType<T extends HostToWebview['type']>(
    type: T,
  ): Array<Extract<HostToWebview, { type: T }>>;
  receive(msg: WebviewToHost): Promise<unknown>;
  setViewState(state: { active?: boolean; visible?: boolean }): void;
  dispose(): void;
}

export function fakeWebviewPanel(state: { active?: boolean; visible?: boolean } = {}): FakePanel {
  const posted: unknown[] = [];
  let onMessage: ((msg: WebviewToHost) => unknown) | undefined;
  const viewStateEmitter = new EventEmitter<{ webviewPanel: unknown }>();
  const disposeEmitter = new EventEmitter<void>();
  const webview = {
    options: {} as unknown,
    html: '',
    cspSource: 'vscode-webview://unit',
    asWebviewUri: (u: Uri) => u,
    postMessage: (msg: unknown) => {
      posted.push(msg);
      return Promise.resolve(true);
    },
    onDidReceiveMessage: (listener: (msg: WebviewToHost) => unknown) => {
      onMessage = listener;
      return new Disposable(() => {
        if (onMessage === listener) onMessage = undefined;
      });
    },
  };
  const panel = {
    webview,
    active: state.active ?? true,
    visible: state.visible ?? true,
    onDidChangeViewState: viewStateEmitter.event,
    onDidDispose: disposeEmitter.event,
  };
  const messages = () => posted.filter((m): m is HostToWebview => typeof m === 'object');
  return {
    panel: panel as unknown as vscode.WebviewPanel,
    webview,
    posted,
    updates: () =>
      messages()
        .filter((m): m is Extract<HostToWebview, { type: 'update' }> => m.type === 'update')
        .map((m) => m.text),
    messagesOfType: <T extends HostToWebview['type']>(type: T) =>
      messages().filter((m): m is Extract<HostToWebview, { type: T }> => m.type === type),
    receive: async (msg: WebviewToHost) => onMessage?.(msg),
    setViewState: (next) => {
      if (next.active !== undefined) panel.active = next.active;
      if (next.visible !== undefined) panel.visible = next.visible;
      viewStateEmitter.fire({ webviewPanel: panel });
    },
    dispose: () => disposeEmitter.fire(),
  };
}

export const context = {
  extensionUri: Uri.parse('file:/ext'),
} as unknown as vscode.ExtensionContext;
export const token = {} as vscode.CancellationToken;

export function newProvider(): EventStormingEditorProvider {
  EventStormingEditorProvider.register(context);
  return vscodeMock.lastRegisteredProvider<EventStormingEditorProvider>();
}

export async function openBoard(
  doc: FakeDoc,
  state: { active?: boolean; visible?: boolean } = {},
  provider: EventStormingEditorProvider = newProvider(),
): Promise<FakePanel> {
  const h = fakeWebviewPanel(state);
  await provider.resolveCustomTextEditor(doc as unknown as vscode.TextDocument, h.panel, token);
  return h;
}

/** Lets queued promise callbacks (writes, notifications) run. */
export async function flushPromises(): Promise<void> {
  for (let round = 0; round < 10; round++) await Promise.resolve();
}
