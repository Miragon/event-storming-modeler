import { test, type Page } from '@playwright/test';
import {
  registerShellConformance,
  vsCodeStubSearch,
  type ShellSkip,
} from '@miragon/modeler-shell/testing';
import { WEBVIEW_THEMES } from '../../../apps/vscode/src/themes.js';
import { SHELL_KIT_SIZES, typeIntoStickyLabel } from '../support/shell-kit.js';
import { postedMessages } from './support/webview.js';

/**
 * The shell's conformance kit against the real VS Code webview (main.ts inside the VS Code stub):
 * geometry at four sizes (1600 × 900 first, then the kit's three), ARIA and keyboard models,
 * chrome keys and select all that never reach VS Code, keyboard creation from the palette, a label
 * editor the shell's zoom, fit and refit keep open, the read-only lock of an invalid file, the
 * appearance VS Code requests (a light-only board stays light, high contrast passes) and a clean
 * teardown. Event Storming has neither a legend nor an inspector, and the webview's menu has no
 * action that hands the focus to the canvas, so the harness declares them absent and the kit
 * asserts they never show; any skip fails the suite.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join('; ');

/** The edits the webview has sent the extension host: each one would land in the document. */
const editsSent = async (page: Page): Promise<number> =>
  (await postedMessages(page)).filter((message) => message.type === 'edit').length;

const editsAtLabelEditorOpen = new WeakMap<Page, number>();

test.describe('VS Code webview: shell conformance', () => {
  test.describe.configure({ timeout: 60_000 });

  registerShellConformance<Page>(
    {
      host: 'ide',
      themes: WEBVIEW_THEMES,
      async open(page, { size, requested }) {
        await page.setViewportSize(size);
        await page.goto(`/webview-test.html?${vsCodeStubSearch(requested)}`);
        await page.waitForFunction(() => window.webviewReady === true);
      },
      sizes: SHELL_KIT_SIZES,
      async destroy(page) {
        await page.evaluate(() => {
          window.connection?.destroy();
          window.modeler?.destroy();
          window.shell?.destroy();
        });
      },
      // The webview's Model group holds only the Level radios and the Type captions checkbox;
      // File actions are VS Code's own (guide §13.5), so no menu action hands the focus to the
      // canvas.
      absent: ['legend', 'inspector', 'canvasMenuAction'],
      // A sticky's label editor over the shell's zoom, fit and refit (contract L5): an edit the
      // webview posts is what VS Code would write into the document.
      labelEditor: {
        async open(page) {
          const typed = await typeIntoStickyLabel(page);
          editsAtLabelEditorOpen.set(page, await editsSent(page));
          return typed;
        },
        async documentChanged(page) {
          return (await editsSent(page)) !== editsAtLabelEditorOpen.get(page);
        },
      },
      show: {
        async problems(page) {
          await page.evaluate(() =>
            window.postMessage({ type: 'problems', count: 2, errors: 1 }, '*'),
          );
          await page.waitForFunction(
            () => document.querySelector<HTMLElement>('[data-chrome="problems"]')?.hidden === false,
          );
        },
        async status(page) {
          await page.evaluate(() => {
            const shell = window.shell!;
            shell.setStatus({
              severity: 'danger',
              text: shell.messages.invalidFile('Event Storming board'),
            });
          });
        },
        // The invalid-file state the way the extension host causes it: an update the modeler
        // cannot import. The DSL reads every text today, so the hook makes that one import fail.
        async invalid(page) {
          await page.evaluate(() => {
            const modeler = window.modeler!;
            const importText = modeler.importText.bind(modeler);
            modeler.importText = () => {
              modeler.importText = importText;
              return Promise.reject(new Error('not importable'));
            };
            window.postMessage({ type: 'update', text: 'title Broken\n' }, '*');
          });
        },
      },
    },
    test,
    {
      onSkip(caseName, skips) {
        throw new Error(`shell conformance "${caseName}" skipped: ${describeSkips(skips)}`);
      },
    },
  );
});
