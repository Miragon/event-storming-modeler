import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ColorThemeKind, vscodeMock } from './__mocks__/vscode';
import { fakeDocument, openBoard, resetApplyEdit } from './fakes';

beforeEach(() => vscodeMock.reset());
afterEach(() => resetApplyEdit());

function htmlTag(html: string): string {
  return /<html[^>]*>/.exec(html)?.[0] ?? '';
}

describe('EventStormingEditorProvider — webview HTML', () => {
  it('writes the CSP with a nonce, and the same nonce on the one script', async () => {
    const h = await openBoard(fakeDocument('/a.storm', 'title A\n'));
    const { html } = h.webview;

    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
    const nonce = /script-src 'nonce-([A-Za-z0-9]+)'/.exec(csp)?.[1];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('font-src vscode-webview://unit data:');
    expect(csp).toContain("style-src vscode-webview://unit 'unsafe-inline'");
    expect(nonce).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(html.match(/<script /g)).toHaveLength(1);
    expect(html).toContain(`<script nonce="${nonce}" src="file:/ext/dist/webview.js">`);
    expect(html).toContain('href="file:/ext/dist/webview.css"');
  });

  it('puts lang, the document class and data-cd-theme="light" on <html> before the first paint', async () => {
    const h = await openBoard(fakeDocument('/a.storm', 'title A\n'));

    expect(htmlTag(h.webview.html)).toBe(
      '<html lang="en" class="cd-shell-document" data-cd-theme="light">',
    );
  });

  it('renders the shell root as the only element of <body>', async () => {
    const h = await openBoard(fakeDocument('/a.storm', 'title A\n'));

    expect(/<body>\s*<div id="app"><\/div>\s*<script /.test(h.webview.html)).toBe(true);
  });

  it('stays light in a dark VS Code theme and passes high contrast', async () => {
    vscodeMock.setColorThemeKind(ColorThemeKind.Dark);
    const dark = await openBoard(fakeDocument('/a.storm', 'title A\n'));
    vscodeMock.setColorThemeKind(ColorThemeKind.HighContrast);
    const highContrast = await openBoard(fakeDocument('/b.storm', 'title B\n'));

    expect(htmlTag(dark.webview.html)).toContain('data-cd-theme="light"');
    expect(htmlTag(dark.webview.html)).not.toContain('data-cd-kontrast');
    expect(htmlTag(highContrast.webview.html)).toContain(
      'data-cd-theme="light" data-cd-kontrast="hoch"',
    );
  });

  it('keeps the webview scripts and the dist folder as the only local resource', async () => {
    const h = await openBoard(fakeDocument('/a.storm', 'title A\n'));

    expect(h.webview.options).toEqual({
      enableScripts: true,
      localResourceRoots: [expect.objectContaining({ path: '/ext/dist' })],
    });
  });
});

describe('EventStormingEditorProvider — theme bridge', () => {
  it('posts the resolved appearance on a theme change, light for a light-only board', async () => {
    const h = await openBoard(fakeDocument('/a.storm', 'title A\n'));

    vscodeMock.setColorThemeKind(ColorThemeKind.HighContrast);

    expect(h.posted).toContainEqual({
      type: 'modelerShell.appearance',
      appearance: { theme: 'light', kontrast: 'hoch' },
    });
  });

  it('re-sends the appearance when a hidden board becomes visible again', async () => {
    const h = await openBoard(fakeDocument('/a.storm', 'title A\n'));
    h.setViewState({ visible: false, active: false });
    const before = h.posted.length;

    h.setViewState({ visible: true, active: true });

    expect(h.posted.slice(before)).toEqual([
      { type: 'modelerShell.appearance', appearance: { theme: 'light' } },
    ]);
  });

  it('stops posting once the panel is disposed', async () => {
    const h = await openBoard(fakeDocument('/a.storm', 'title A\n'));
    h.dispose();
    const before = h.posted.length;

    vscodeMock.setColorThemeKind(ColorThemeKind.Dark);

    expect(h.posted).toHaveLength(before);
  });
});
