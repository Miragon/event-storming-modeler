import { test, type Page } from '@playwright/test';
import { registerShellConformance, vsCodeStubSearch } from '@miragon/modeler-shell/testing';
import { WEBVIEW_THEMES } from '../../../apps/vscode/src/themes.js';

/**
 * The shell's conformance kit against the real VS Code webview (main.ts inside the VS Code stub):
 * geometry at three sizes, ARIA and keyboard models, chrome keys that never reach VS Code, the
 * appearance VS Code requests (a light-only board stays light, high contrast passes) and a clean
 * teardown. Event Storming has neither a legend nor an inspector, so only their checks may skip;
 * any other skip fails the suite.
 */
const ISLANDS_EVENT_STORMING_LACKS = /^show\.(legend|inspector) is undefined:/;

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
      async destroy(page) {
        await page.evaluate(() => {
          window.connection?.destroy();
          window.modeler?.destroy();
          window.shell?.destroy();
        });
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
      },
    },
    test,
    {
      onSkip(caseName, reason) {
        const unexpected = reason
          .split('; ')
          .filter((part) => !ISLANDS_EVENT_STORMING_LACKS.test(part));
        if (unexpected.length > 0) {
          throw new Error(`shell conformance "${caseName}" skipped: ${unexpected.join('; ')}`);
        }
        test.info().annotations.push({ type: 'skip', description: `${caseName}: ${reason}` });
      },
    },
  );
});
