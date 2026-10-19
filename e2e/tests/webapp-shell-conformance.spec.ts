import { test, type Page } from '@playwright/test';
import { registerShellConformance, type ShellSkip } from '@miragon/modeler-shell/testing';
import { EXAMPLE_BOARD } from '../../apps/webapp/src/example.js';
import { encodeMapCompressed } from '../../apps/webapp/src/share.js';
import { THEMES } from '../../apps/webapp/src/themes.js';
import { waitForViewer } from './support/viewer.js';

/**
 * The shell's conformance kit against the real web app (the web host of guide §5.2): geometry at
 * three sizes with the primary action, the legal line and the raised zoom row, ARIA and keyboard
 * models, keyboard creation from the palette, the light-only mode under any system setting, the
 * start screen, toasts, the problems list, the drop zone and a clean teardown. The web app has
 * neither a legend nor an inspector, and no invalid-file state (an import that fails leaves the
 * board as it was), so the harness declares them absent; any skip fails the suite.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join('; ');

/** Pages that start every visit without a stored preference (type captions, appearance). */
const freshPages = new WeakSet<Page>();

test.describe('web app: shell conformance', () => {
  test.describe.configure({ timeout: 60_000 });

  registerShellConformance<Page>(
    {
      host: 'web',
      themes: THEMES,
      // The kit emulates the system's colour scheme and contrast before every open.
      async open(page, { size }) {
        if (!freshPages.has(page)) {
          freshPages.add(page);
          await page.addInitScript(() => {
            try {
              localStorage.clear();
            } catch {
              // A blocked storage holds no preference either.
            }
          });
        }
        await page.setViewportSize(size);
        await page.goto(`/#mz=${await encodeMapCompressed(EXAMPLE_BOARD)}`);
        await waitForViewer(page);
      },
      async destroy(page) {
        await page.evaluate(() => window.__eventStormingApp?.destroy());
      },
      absent: ['legend', 'inspector', 'invalid'],
      show: {
        // The web app's imports carry no element ids today (the parser reports lines), so the
        // pill gets one finding with a line and one on a sticky of the example, as rows of both
        // kinds look in the list.
        async problems(page) {
          await page.evaluate(() =>
            window.__eventStormingApp?.shell.setProblems({
              count: 2,
              errors: 0,
              items: [
                {
                  severity: 'warning',
                  message: 'Line could not be interpreted — “event B [abc, 20]”',
                  location: 'Line 3',
                },
                {
                  severity: 'warning',
                  message: 'Attachment: “#nowhere” not found',
                  location: '“Order Placed”',
                  elementId: 'event_order_placed',
                },
              ],
            }),
          );
        },
        async status(page) {
          await page.evaluate(() => {
            const shell = window.__eventStormingApp!.shell;
            shell.setStatus({
              severity: 'danger',
              text: shell.messages.invalidFile('Event Storming board'),
            });
          });
        },
        // A fresh visit: the page without a board in its link.
        async emptyState(page) {
          await page.goto('/');
          await waitForViewer(page);
        },
        async toast(page, { status, text, actionLabel }) {
          await page.evaluate(
            ({ status, text, actionLabel }) => {
              window.__eventStormingApp?.shell.toast({
                status,
                text,
                ...(actionLabel ? { action: { label: actionLabel, onSelect() {} } } : {}),
              });
            },
            { status, text, actionLabel },
          );
        },
      },
      drop: {
        // A .storm file has no MIME type the browser knows; a picture is refused already while
        // it is dragged and, dropped all the same, opens nothing.
        accepted: { name: 'board.storm', type: '', text: EXAMPLE_BOARD },
        rejected: { name: 'map.png', type: 'image/png', text: 'x' },
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
