import {
  installVsCodeWebviewStub,
  stubOptionsFromSearch,
} from '@miragon/modeler-shell/testing/vscode-stub';
import { EMPTY_BOARD, EXAMPLE_BOARD } from '../../apps/vscode/src/examples.js';
import { WEBVIEW_THEMES } from '../../apps/vscode/src/themes.js';

// The stub stands in for VS Code (default styles, <html> as renderWebviewHtml writes it, body
// theme classes, acquireVsCodeApi, theme bridge) and must be in place before the webview runs.
installVsCodeWebviewStub({ ...stubOptionsFromSearch(location.search), themes: WEBVIEW_THEMES });
const { webview } = await import('../../apps/vscode/src/webview/main.js');

// The tests drive the webview through these; the shipped bundle publishes nothing on window.
window.shell = webview.shell;
window.modeler = webview.modeler;
window.connection = webview.connection;
void webview.ready.then(() => {
  window.webviewReady = true;
});

const search = new URLSearchParams(location.search);
const board = search.get('board');
window.postMessage(
  {
    type: 'init',
    text: search.get('text') ?? (board === 'empty' ? EMPTY_BOARD : EXAMPLE_BOARD),
  },
  '*',
);
