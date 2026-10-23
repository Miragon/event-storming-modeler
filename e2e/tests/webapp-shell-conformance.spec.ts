import { test, type Page } from '@playwright/test';
import { registerShellConformance, type ShellSkip } from '@miragon/modeler-shell/testing';
import { EXAMPLE_BOARD } from '../../apps/webapp/src/example.js';
import { encodeMapCompressed } from '../../apps/webapp/src/share.js';
import { THEMES } from '../../apps/webapp/src/themes.js';
import { SHELL_KIT_SIZES, typeIntoStickyLabel } from './support/shell-kit.js';
import { exportDSL, waitForViewer } from './support/viewer.js';

/**
 * The shell's conformance kit against the real web app (the web host of guide §5.2): geometry at
 * four sizes (1600 × 900 first, then the kit's three) with the primary action, the legal line and
 * the raised zoom row, ARIA and keyboard models, keyboard creation from the palette, a label
 * editor the chrome's zoom, fit and refit keep open, the focus after a File action, the light-only
 * mode under any system setting, the start screen, toasts, the problems list, the drop zone and a
 * clean teardown. The web app has neither a legend nor an inspector, no invalid-file state (an
 * import that fails leaves the board as it was) and no problem that points at an element, so the
 * harness declares them absent; any skip fails the suite.
 */
const describeSkips = (skips: readonly ShellSkip[]): string =>
  skips.map((skip) => `${skip.hook}: ${skip.reason}`).join('; ');

/** The example with two lines the parser cannot take: two text rows in the problems list. */
const BOARD_WITH_FINDINGS = `${EXAMPLE_BOARD}\nevent Broken [abc, 20]\nOrder Placed -> Nowhere\n`;

/** Pages that start every visit without a stored preference (type captions, appearance). */
const freshPages = new WeakSet<Page>();

/** The board text when the label editor last opened: what a save or a share would carry. */
const boardAtLabelEditorOpen = new WeakMap<Page, string>();

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
      sizes: SHELL_KIT_SIZES,
      async destroy(page) {
        await page.evaluate(() => window.__eventStormingApp?.destroy());
      },
      // The web app's problems come from the parser and name lines, never elements (a JSON board
      // with a dangling pin is refused before the import), so no row of its list selects.
      absent: ['legend', 'inspector', 'invalid', 'problemSelection'],
      show: {
        // A link to a board with findings, loaded fresh: the import the user started reports them
        // to the pill and its list, as the app's real path does.
        async problems(page) {
          await page.goto(`/?problems#mz=${await encodeMapCompressed(BOARD_WITH_FINDINGS)}`);
          await waitForViewer(page);
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
      // A sticky's label editor over the chrome's zoom, fit and refit (contract L5): the board
      // text is what Export as .storm and Share would carry.
      labelEditor: {
        async open(page) {
          const typed = await typeIntoStickyLabel(page);
          boardAtLabelEditorOpen.set(page, await exportDSL(page));
          return typed;
        },
        async documentChanged(page) {
          return (await exportDSL(page)) !== boardAtLabelEditorOpen.get(page);
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
