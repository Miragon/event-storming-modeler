import { expect, test, type Page } from '@playwright/test';
import { EXAMPLE_BOARD } from '../../apps/webapp/src/example.js';
import { encodeMapCompressed } from '../../apps/webapp/src/share.js';
import {
  exportBoard,
  exportDSL,
  openExample,
  openMenu,
  startScreen,
  waitForViewer,
} from './support/viewer.js';

/**
 * The web app's side of the shell's web chrome: what it hands the shell (menu groups, primary
 * action, legal links, start screen, drop zone) and its own handlers behind them (share link,
 * replace with undo, open, drop, exports, app keys, problems). What the shell guarantees itself
 * runs in webapp-shell-conformance.spec.ts.
 */

const BROKEN_BOARD = [
  'title Broken',
  'event A [100, 100]',
  'event B [abc, 20]',
  'A -> Nowhere',
].join('\n');

async function linkTo(dsl: string): Promise<string> {
  return `/#mz=${await encodeMapCompressed(dsl)}`;
}

async function openLink(page: Page, dsl: string): Promise<void> {
  await page.goto(await linkTo(dsl));
  await waitForViewer(page);
}

function toast(page: Page, text: string | RegExp) {
  return page.locator('[data-chrome="toasts"] .cd-shell-toast').filter({ hasText: text });
}

function fileInput(page: Page) {
  return page.locator('body > input[type="file"]');
}

async function menuLayout(page: Page): Promise<Array<string | null>> {
  const dropdown = await openMenu(page);
  return dropdown.evaluate((menu) =>
    [...menu.children].map((child) =>
      child.getAttribute('role') === 'separator' ? '|' : child.getAttribute('data-menu-id'),
    ),
  );
}

/** A file drag and drop on the page, as the browser delivers one (the drop zone listens on window). */
async function dropFile(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    ({ name, text }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], name, { type: '' }));
      for (const type of ['dragenter', 'dragover', 'drop']) {
        document.body.dispatchEvent(
          new DragEvent(type, { dataTransfer: transfer, bubbles: true, cancelable: true }),
        );
      }
    },
    { name, text },
  );
}

test.describe('webapp: the shell web chrome and the app behind it', () => {
  test('the start screen hides the work chrome until a board starts', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);

    await expect(startScreen(page)).toBeVisible();
    await expect(startScreen(page).getByRole('heading', { level: 1 })).toHaveText(
      'Event Storming Modeler',
    );
    await expect(startScreen(page)).toContainText('Or drop a .storm, .json, or .txt file here');
    await expect(page).toHaveTitle('Event Storming Modeler');
    for (const island of ['menu', 'primary', 'palette', 'zoom']) {
      await expect(page.locator(`[data-chrome="${island}"]`)).toBeHidden();
    }
    await expect(page.locator('[data-chrome="legal"]')).toBeVisible();

    await startScreen(page).getByRole('button', { name: 'New diagram' }).click();
    await expect(startScreen(page)).toBeHidden();
    for (const island of ['menu', 'primary', 'palette', 'zoom']) {
      await expect(page.locator(`[data-chrome="${island}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-chrome="zoom"] [data-zoom="actual"]')).toHaveText('100%');
    expect(new URL(page.url()).hash).toBe('');
  });

  test('a shared link opens its board at once, without the start screen', async ({ page }) => {
    await openLink(page, EXAMPLE_BOARD);

    await expect(startScreen(page)).toBeHidden();
    expect((await exportBoard(page)).config.title).toBe('Order Checkout');
    await expect(page.locator('[data-chrome="primary"]')).toBeVisible();
  });

  test('a link cut off when it was copied shows a danger toast on the start screen', async ({
    page,
  }) => {
    await page.goto('/#mz=!!!not-a-board');
    await waitForViewer(page);

    await expect(startScreen(page)).toBeVisible();
    await expect(toast(page, 'Check that you copied the whole link.')).toHaveAttribute(
      'data-status',
      'danger',
    );
  });

  test('the menu holds File, Model, Export and Help; no Appearance, no Undo', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);

    expect(await menuLayout(page)).toEqual([
      'new-diagram',
      'open',
      'show-example',
      '|',
      'level',
      'type-captions',
      '|',
      'export-png',
      'export-svg',
      'export-png-transparent',
      'export-json',
      'export-storm',
      '|',
      'keyboard-shortcuts',
    ]);
    const dropdown = page.locator('.cd-shell-menu[role="menu"]');
    await expect(dropdown.locator('[data-menu-id="open"]')).toHaveText(/Open…\s*(⌘|Ctrl\+)O/);
    await expect(dropdown.locator('[data-menu-id="export-storm"]')).toHaveText(
      /Export as \.storm\s*(⌘|Ctrl\+)S/,
    );
    await expect(dropdown.locator('[data-menu-group="appearance"]')).toHaveCount(0);
    await expect(dropdown.getByRole('menuitem', { name: /undo|redo/i })).toHaveCount(0);
  });

  test('Share copies the link, writes it into the address bar and confirms with a toast', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);

    await page.locator('[data-chrome="primary"]').click();

    await expect(toast(page, 'Link copied')).toHaveAttribute('data-status', 'success');
    // Screen readers hear it through the shell's polite live region.
    await expect(page.locator('.cd-shell-live [role="status"]')).toHaveText('Link copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/#mz=[\w-]+$/);
    expect(copied).toBe(page.url());

    const shared = await context.newPage();
    await shared.goto(copied);
    await waitForViewer(shared);
    expect(await exportDSL(shared)).toBe(await exportDSL(page));
  });

  test('a refused copy points at the address bar', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);
    await page.evaluate(() => {
      const refuse = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
      Object.assign(navigator.clipboard, { write: refuse, writeText: refuse });
    });

    await page.locator('[data-chrome="primary"]').click();

    await expect(
      toast(page, "Couldn't copy the link. Copy it from the address bar instead."),
    ).toHaveAttribute('data-status', 'danger');
    expect(new URL(page.url()).hash).toMatch(/^#mz=/);
  });

  test('replacing a board offers Undo instead of asking first', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);
    const example = await exportDSL(page);

    const dropdown = await openMenu(page);
    await dropdown.locator('[data-menu-id="new-diagram"]').click();
    await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(0);

    const offer = toast(page, 'Board replaced');
    await expect(offer).toBeVisible();
    await offer.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => exportDSL(page)).toBe(example);
    await expect(offer).toBeHidden();
  });

  test('an edit after a replacement withdraws the undo offer', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);
    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect(toast(page, 'Board replaced')).toBeVisible();

    await page.locator('.djs-palette [data-action="create.event"]').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');

    await expect(toast(page, 'Board replaced')).toBeHidden();
    expect((await exportBoard(page)).elements).toHaveLength(1);
  });

  test('Open… reads a .storm file; its warnings go to the pill and its list', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);

    await fileInput(page).setInputFiles({
      name: 'broken.storm',
      mimeType: 'text/plain',
      buffer: Buffer.from(BROKEN_BOARD),
    });

    await expect.poll(async () => (await exportBoard(page)).config.title).toBe('Broken');
    await expect(
      toast(page, 'Imported with 2 warnings. Details under “2 problems” bottom left.'),
    ).toBeVisible();
    await expect(toast(page, 'Board replaced')).toBeVisible();
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toHaveText('2 problems');

    await pill.click();
    const list = page.locator('[data-chrome="problems-popover"]');
    await expect(list).toBeVisible();
    await expect(list.locator('.cd-shell-problem-location')).toHaveText([
      'Line 3 · event B [abc, 20]',
      'Line 4 · A -> Nowhere',
    ]);
    await expect(list.locator('.cd-shell-problem-message')).toHaveText([
      "Couldn't read this line. It stays in the file unchanged.",
      "This arrow points to “Nowhere”, which isn't on the board.",
    ]);
    // Text rows take the focus too, so the keyboard reads the whole list (WCAG 2.1.1).
    await expect(list.locator('.cd-shell-problem').first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(list.locator('.cd-shell-problem').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(pill).toBeFocused();
  });

  test('a file that is no board shows a danger toast and keeps the board', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);
    const before = await exportDSL(page);

    await fileInput(page).setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ "elements": '),
    });

    await expect(
      toast(page, "Couldn't read “bad.json”. Check that it contains a valid Event Storming board."),
    ).toHaveAttribute('data-status', 'danger');
    expect(await exportDSL(page)).toBe(before);
  });

  test('a .storm file dropped on the start screen opens', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);

    await dropFile(page, 'checkout.storm', EXAMPLE_BOARD);

    await expect(startScreen(page)).toBeHidden();
    await expect.poll(async () => (await exportBoard(page)).config.title).toBe('Order Checkout');
    await expect(page.locator('[data-chrome="palette"]')).toBeVisible();
  });

  test('the exports download under the board’s name and confirm with a toast', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);

    const expected: ReadonlyArray<[string, string]> = [
      ['export-png', 'order-checkout.png'],
      ['export-svg', 'order-checkout.svg'],
      ['export-png-transparent', 'order-checkout-transparent@4x.png'],
      ['export-json', 'order-checkout.json'],
      ['export-storm', 'order-checkout.storm'],
    ];
    for (const [id, fileName] of expected) {
      const dropdown = await openMenu(page);
      const download = page.waitForEvent('download');
      await dropdown.locator(`[data-menu-id="${id}"]`).click();
      expect((await download).suggestedFilename()).toBe(fileName);
      await expect(toast(page, `Exported ${fileName}.`)).toBeVisible();
    }
  });

  test('the .storm and JSON exports hold the board', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);
    const readDownload = async (id: string): Promise<string> => {
      const dropdown = await openMenu(page);
      const download = page.waitForEvent('download');
      await dropdown.locator(`[data-menu-id="${id}"]`).click();
      const stream = await (await download).createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks).toString('utf8');
    };

    expect(await readDownload('export-storm')).toBe(await exportDSL(page));
    const json = JSON.parse(await readDownload('export-json')) as { config: { title: string } };
    expect(json.config.title).toBe('Order Checkout');
  });

  test('a JSON export opens again as the same board, overlapping stickies in their order', async ({
    page,
  }) => {
    // Zeta lies under Alpha; an export sorted by id would swap them.
    const overlapping = 'title Overlap\nevent Zeta [300, 300]\nevent Alpha [330, 320]';
    await openLink(page, overlapping);
    const before = await exportDSL(page);
    const dropdown = await openMenu(page);
    const download = page.waitForEvent('download');
    await dropdown.locator('[data-menu-id="export-json"]').click();
    const stream = await (await download).createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);

    await fileInput(page).setInputFiles({
      name: 'overlap.json',
      mimeType: 'application/json',
      buffer: Buffer.concat(chunks),
    });

    await expect(toast(page, 'Exported overlap.json.')).toBeVisible();
    await expect.poll(() => exportDSL(page)).toBe(before);
    // Nothing changed, so there is nothing to undo.
    await expect(toast(page, 'Board replaced')).toHaveCount(0);
    expect((await exportBoard(page)).elements.map((element) => element.id)).toEqual([
      'event_zeta',
      'event_alpha',
    ]);
  });

  test('Cmd/Ctrl+O opens the file picker and Cmd/Ctrl+S exports the .storm file', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);

    const chooser = page.waitForEvent('filechooser');
    await page.keyboard.press('ControlOrMeta+O');
    expect((await chooser).isMultiple()).toBe(false);

    const download = page.waitForEvent('download');
    await page.keyboard.press('ControlOrMeta+S');
    expect((await download).suggestedFilename()).toBe('order-checkout.storm');
  });

  test('Cmd/Ctrl+S saves nothing on the start screen, and never reaches the browser', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForViewer(page);
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    const prevented = page.evaluate(
      () =>
        new Promise<boolean>((resolve) =>
          window.addEventListener('keydown', (event) => {
            if (event.key.toLowerCase() === 's') resolve(event.defaultPrevented);
          }),
        ),
    );

    await page.keyboard.press('ControlOrMeta+S');

    expect(await prevented).toBe(true);
    await page.waitForTimeout(300);
    expect(downloads).toEqual([]);
    await expect(page.locator('[data-chrome="toasts"] .cd-shell-toast')).toHaveCount(0);
    await expect(startScreen(page)).toBeVisible();
  });

  test('the start screen opens a file from its hint, without the hidden menu', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    const open = startScreen(page).getByRole('button', { name: 'Open a file…' });
    await expect(open).toHaveAttribute('aria-keyshortcuts', /^(Meta|Control)\+O$/);

    const chooser = page.waitForEvent('filechooser');
    await open.click();
    await (
      await chooser
    ).setFiles({
      name: 'checkout.storm',
      mimeType: 'text/plain',
      buffer: Buffer.from(EXAMPLE_BOARD),
    });

    await expect(startScreen(page)).toBeHidden();
    await expect.poll(async () => (await exportBoard(page)).config.title).toBe('Order Checkout');
  });

  test('Cmd/Ctrl+Z takes back a replaced board while the canvas has nothing to undo', async ({
    page,
  }) => {
    await openLink(page, EXAMPLE_BOARD);
    const example = await exportDSL(page);
    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect.poll(async () => (await exportBoard(page)).elements.length).toBe(0);
    await expect(toast(page, 'Board replaced')).toBeVisible();

    await page.locator('.cd-shell-canvas svg[tabindex]').focus();
    await page.keyboard.press('ControlOrMeta+Z');

    await expect.poll(() => exportDSL(page)).toBe(example);
    await expect(toast(page, 'Board replaced')).toBeHidden();
  });

  test('the tab names the board, and the app alone on the start screen', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    await expect(page).toHaveTitle('Event Storming Modeler');

    await openExample(page);
    await expect(page).toHaveTitle('Order Checkout · Event Storming Modeler');

    await (await openMenu(page)).locator('[data-menu-id="new-diagram"]').click();
    await expect(page).toHaveTitle('Event Storming Modeler');
  });

  test('the shortcuts dialog lists the file keys first and returns the focus', async ({ page }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);

    await (await openMenu(page)).locator('[data-menu-id="keyboard-shortcuts"]').click();
    const dialog = page.locator('.cd-shell dialog.event-storming-shortcuts');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.event-storming-shortcuts-group-title')).toHaveText([
      'File',
      'View',
      'Edit',
      'Tools',
    ]);
    await expect(dialog.getByRole('row', { name: /Open…/ })).toContainText(/(⌘|Ctrl\+)O/);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-chrome="menu"]')).toBeFocused();
  });

  // Guide §5.8 (modeler-shell 0.2.2): a pointer click on the chrome hands the keys back to the
  // board, so Event Storming's own keys act at once; Enter leaves the focus on the control.
  test('after a pointer click on + or a palette entry, Delete acts on the board', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForViewer(page);
    await openExample(page);
    const stickies = () =>
      page.evaluate(() => window.__eventStormingViewer.exportMap().elements.length);
    const canvasHasFocus = () =>
      page.evaluate(
        () =>
          document.activeElement instanceof SVGSVGElement &&
          document.activeElement.closest('.event-storming-container') !== null,
      );
    const before = await stickies();
    await page.locator('.djs-element.djs-shape[data-element-id="event_order_placed"]').click();
    const zoomIn = page.locator('[data-chrome="zoom"] [data-zoom="in"]');
    await zoomIn.click();
    expect(await canvasHasFocus()).toBe(true);
    await page.keyboard.press('Delete');
    await expect.poll(stickies).toBe(before - 1);

    await zoomIn.focus();
    await page.keyboard.press('Enter');
    await expect(zoomIn).toBeFocused();

    await page.locator('[data-chrome="palette"] [data-action="create.event"]').click();
    const canvas = (await page.locator('.cd-shell-canvas').boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height - 160);
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height - 160);
    await expect.poll(stickies).toBe(before);
    expect(await canvasHasFocus()).toBe(true);
    await page.keyboard.press('Delete');
    await expect.poll(stickies).toBe(before - 1);
  });

  test('the legal line names Miragon GmbH and keeps Impressum and Datenschutz German', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForViewer(page);

    const legal = page.locator('[data-chrome="legal"]');
    const year = new Date().getFullYear();
    await expect(legal.getByRole('link', { name: `© ${year} Miragon GmbH` })).toHaveAttribute(
      'href',
      'https://www.miragon.io/',
    );
    for (const [name, href] of [
      ['Impressum', 'https://www.miragon.io/impressum/'],
      ['Datenschutz', 'https://www.miragon.io/datenschutz/'],
    ] as const) {
      const link = legal.getByRole('link', { name });
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('lang', 'de');
    }
    await expect(legal.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/Miragon/event-storming-modeler',
    );
  });

  test('type captions stay off after a reload, outside the link', async ({ page }) => {
    await openLink(page, EXAMPLE_BOARD);
    const captions = page.locator('.cd-shell-canvas .event-storming-kind-caption');
    await expect(captions.first()).toBeVisible();

    await (await openMenu(page)).locator('[data-menu-id="type-captions"]').click();
    await expect(captions).toHaveCount(0);
    const link = page.url();

    await page.reload();
    await waitForViewer(page);
    expect(page.url()).toBe(link);
    await expect(captions).toHaveCount(0);
    await expect((await openMenu(page)).locator('[data-menu-id="type-captions"]')).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  test('a link pasted into the open tab replaces the board, with Undo', async ({ page }) => {
    await openLink(page, EXAMPLE_BOARD);
    const example = await exportDSL(page);

    const other = await linkTo('title Pasted\nevent Pasted Event [100, 100]');
    await page.evaluate((hash) => {
      location.hash = hash;
    }, other.slice(1));

    await expect.poll(async () => (await exportBoard(page)).config.title).toBe('Pasted');
    await toast(page, 'Board replaced').getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => exportDSL(page)).toBe(example);
  });
});
