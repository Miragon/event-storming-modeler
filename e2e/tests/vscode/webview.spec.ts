import { expect, test, type Locator, type Page } from '@playwright/test';
import { ICONS, type ShellIconName } from '@miragon/modeler-shell';
import { EMPTY_BOARD, withExampleInserted } from '../../../apps/vscode/src/examples.js';
import {
  openWebview,
  postFromHost,
  postedMessages,
  waitForPosted,
  type PostedMessage,
} from './support/webview.js';

/**
 * The webview's side of the protocol with the extension host and the chrome it configures in the
 * shell: menu groups, palette keys, problems pill, empty-file hint, Command Palette commands and
 * the keyboard shortcuts dialog. What the shell guarantees itself is covered by
 * shell-conformance.spec.ts.
 */

async function openMenu(page: Page): Promise<Locator> {
  await page.locator('[data-chrome="menu"]').click();
  const dropdown = page.locator('.cd-shell-menu[role="menu"]');
  await expect(dropdown).toBeVisible();
  return dropdown;
}

function countOf(messages: readonly PostedMessage[], type: string): number {
  return messages.filter((message) => message.type === type).length;
}

/** The icon of a menu entry as Lucide nodes, to compare with the shell's `ICONS`. */
function iconNodesOf(entry: Locator): Promise<Array<[string, Record<string, string>]>> {
  return entry.evaluate((element) =>
    [...(element.querySelector('.cd-shell-menu-item-icon svg')?.children ?? [])].map(
      (child): [string, Record<string, string>] => [
        child.tagName,
        Object.fromEntries(
          [...child.attributes].map((attribute) => [attribute.name, attribute.value]),
        ),
      ],
    ),
  );
}

function lucideNodes(name: ShellIconName): Array<[string, Record<string, string>]> {
  return ICONS[name].map(([tag, attributes]) => [tag, { ...attributes }]);
}

async function viewboxOf(page: Page) {
  return page.evaluate(() => window.connection!.viewport.getViewbox()!);
}

test.describe('VS Code webview: protocol and chrome', () => {
  test('posts ready exactly once', async ({ page }) => {
    await openWebview(page);
    const messages = await postedMessages(page);
    expect(messages).toContainEqual({ type: 'ready' });
    expect(countOf(messages, 'ready')).toBe(1);
    expect(countOf(messages, 'edit')).toBe(0);
  });

  test('the menu holds Model (level, type captions), Export (PNG before SVG) and Help', async ({
    page,
  }) => {
    await openWebview(page);
    const dropdown = await openMenu(page);

    const layout = await dropdown.evaluate((menu) =>
      [...menu.children].map((child) =>
        child.getAttribute('role') === 'separator' ? '|' : child.getAttribute('data-menu-id'),
      ),
    );
    expect(layout).toEqual([
      'level',
      'type-captions',
      '|',
      'export-png',
      'export-svg',
      '|',
      'keyboard-shortcuts',
    ]);

    const level = dropdown.locator('[data-menu-id="level"]');
    await expect(level).toHaveAttribute('role', 'group');
    await expect(level).toHaveAttribute('aria-label', 'Level');
    const levelOptions = level.locator('[role="menuitemradio"]');
    await expect(levelOptions).toHaveText(['Big picture', 'Process modelling', 'Software design']);
    expect(
      await levelOptions.evaluateAll((options) =>
        options.map((option) => option.getAttribute('data-menu-value')),
      ),
    ).toEqual(['big-picture', 'process', 'design']);

    const typeCaptions = dropdown.locator('[data-menu-id="type-captions"]');
    await expect(typeCaptions).toHaveAttribute('role', 'menuitemcheckbox');
    await expect(typeCaptions).toHaveText('Type captions');
    await expect(typeCaptions).toHaveAttribute('aria-checked', 'true');

    const exportPng = dropdown.locator('[data-menu-id="export-png"]');
    const exportSvg = dropdown.locator('[data-menu-id="export-svg"]');
    const shortcuts = dropdown.locator('[data-menu-id="keyboard-shortcuts"]');
    await expect(exportPng).toHaveText('Export as PNG');
    await expect(exportSvg).toHaveText('Export as SVG');
    await expect(shortcuts).toHaveText('Keyboard shortcuts…');
    await expect(shortcuts).toHaveAttribute('aria-haspopup', 'dialog');
    expect(await iconNodesOf(exportPng)).toEqual(lucideNodes('file-image'));
    expect(await iconNodesOf(exportSvg)).toEqual(lucideNodes('file-code-corner'));
    expect(await iconNodesOf(shortcuts)).toEqual(lucideNodes('keyboard'));
  });

  test('a level is a document edit, type captions are view state kept in the webview state', async ({
    page,
  }) => {
    await openWebview(page);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window.__modelerShellVsCodeStub?.state() as { modelerShell?: unknown })?.modelerShell,
        ),
      )
      .toBeDefined();

    const dropdown = await openMenu(page);
    await dropdown.locator('[data-menu-value="process"]').click();
    const edit = await waitForPosted(page, 'edit');
    expect(edit.text).toMatch(/^level process$/m);
    await expect(dropdown.locator('[data-menu-value="process"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    const editsBefore = countOf(await postedMessages(page), 'edit');
    await dropdown.locator('[data-menu-id="type-captions"]').click();
    await expect(dropdown.locator('[data-menu-id="type-captions"]')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    const state = (await page.evaluate(() => window.__modelerShellVsCodeStub?.state())) as {
      typeCaptionsVisible?: boolean;
      modelerShell?: unknown;
    };
    expect(state.typeCaptionsVisible).toBe(false);
    expect(state.modelerShell).toBeDefined();
    expect(countOf(await postedMessages(page), 'edit')).toBe(editsBefore);
  });

  test('a canvas edit posts the new document text', async ({ page }) => {
    await openWebview(page, { board: 'empty' });
    await page.locator('.djs-palette [data-action="create.event"]').click();
    const canvas = (await page.locator('.cd-shell-canvas').boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width * 0.3, canvas.y + canvas.height * 0.7, {
      steps: 6,
    });
    await page.mouse.down();
    await page.mouse.up();

    const edit = await waitForPosted(page, 'edit');
    expect(edit.text).toMatch(/^event Domain Event \[/m);
  });

  test('undo on the canvas belongs to the VS Code document, not to the canvas', async ({
    page,
  }) => {
    await openWebview(page, { board: 'empty' });
    await page.locator('.djs-palette [data-action="create.event"]').click();
    const canvas = (await page.locator('.cd-shell-canvas').boundingBox())!;
    await page.mouse.click(canvas.x + canvas.width * 0.3, canvas.y + canvas.height * 0.7);
    await waitForPosted(page, 'edit');
    const editsBefore = countOf(await postedMessages(page), 'edit');
    const stickies = () =>
      page.evaluate(
        () =>
          window
            .modeler!.diagram.get<{ getAll(): Array<{ parent?: unknown; waypoints?: unknown }> }>(
              'elementRegistry',
            )
            .getAll()
            .filter((element) => element.parent && !element.waypoints).length,
      );
    expect(await stickies()).toBe(1);

    await page.locator('.cd-shell-canvas svg[role="application"]').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await page.waitForTimeout(300);

    expect(await stickies()).toBe(1);
    expect(countOf(await postedMessages(page), 'edit')).toBe(editsBefore);
  });

  test('a dark VS Code theme keeps the board light; high contrast passes at runtime', async ({
    page,
  }) => {
    await openWebview(page, { requested: { theme: 'dark' } });
    const html = page.locator('html');
    const colours = () =>
      page.evaluate(() => ({
        grund: getComputedStyle(document.documentElement).getPropertyValue('--cd-ui-grund').trim(),
        paper: getComputedStyle(document.querySelector('.cd-shell-canvas')!).backgroundColor,
        dropdown: getComputedStyle(document.querySelector('.cd-shell-menu')!).backgroundColor,
      }));
    const light = { grund: '#F9F7F7', paper: 'rgb(249, 247, 247)', dropdown: 'rgb(255, 255, 255)' };

    await expect(html).toHaveAttribute('data-cd-theme', 'light');
    await expect(html).not.toHaveAttribute('data-cd-kontrast');
    expect(await colours()).toEqual(light);

    await page.evaluate(() => window.__modelerShellVsCodeStub!.setColorThemeKind(3));
    await expect(html).toHaveAttribute('data-cd-kontrast', 'hoch');
    await expect(html).toHaveAttribute('data-cd-theme', 'light');
    expect(await colours()).toEqual(light);

    await page.evaluate(() => window.__modelerShellVsCodeStub!.setColorThemeKind(2));
    await expect(html).not.toHaveAttribute('data-cd-kontrast');
    await expect(html).toHaveAttribute('data-cd-theme', 'light');
  });

  test('an empty board shows the hint; Insert example asks the host, whose update fits', async ({
    page,
  }) => {
    await openWebview(page, { board: 'empty' });
    const hint = page.locator('.cd-shell-hint');
    await expect(hint).toBeVisible();
    await expect(hint.locator('.cd-shell-hint-text')).toHaveText(
      'Pick a tool from the palette to start.',
    );

    await hint.locator('.cd-shell-hint-action').click();
    await waitForPosted(page, 'insertExample');
    expect(countOf(await postedMessages(page), 'edit')).toBe(0);

    await postFromHost(page, { type: 'update', text: withExampleInserted(EMPTY_BOARD) });
    await expect(hint).toBeHidden();
    await expect(page.locator('.cd-shell-canvas .djs-element.djs-shape').first()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => window.connection!.viewport.isAutomatic() && window.connection!.viewport.canFit(),
        ),
      )
      .toBe(true);
  });

  test('a problems message shows the pill; activating it asks for the Problems view', async ({
    page,
  }) => {
    await openWebview(page);
    const pill = page.locator('[data-chrome="problems"]');
    await expect(pill).toBeHidden();

    await postFromHost(page, { type: 'problems', count: 2, errors: 0 });
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute('aria-label', '2 problems, no errors');

    await pill.click();
    await waitForPosted(page, 'showProblems');

    await postFromHost(page, { type: 'problems', count: 0, errors: 0 });
    await expect(pill).toBeHidden();
  });

  test('the fitView command fits the board again after a zoom', async ({ page }) => {
    await openWebview(page);
    const fitted = await viewboxOf(page);

    await page.locator('[data-chrome="zoom"] [data-zoom="in"]').click();
    await expect
      .poll(() => page.evaluate(() => window.connection!.viewport.isAutomatic()))
      .toBe(false);
    expect((await viewboxOf(page)).width).toBeLessThan(fitted.width);

    await postFromHost(page, { type: 'command', name: 'fitView' });
    await expect
      .poll(async () => {
        const now = await viewboxOf(page);
        return [now.x - fitted.x, now.y - fitted.y, now.width - fitted.width].every(
          (delta) => Math.abs(delta) < 0.5,
        );
      })
      .toBe(true);
    expect(await page.evaluate(() => window.connection!.viewport.isAutomatic())).toBe(true);
  });

  test('the export commands and menu entries post the exported image', async ({ page }) => {
    await openWebview(page);
    await postFromHost(page, { type: 'command', name: 'exportSvg' });
    const svg = await waitForPosted(page, 'export');
    expect(svg.format).toBe('svg');
    expect(typeof svg.data).toBe('string');
    expect(String(svg.data).length).toBeGreaterThan(0);

    const dropdown = await openMenu(page);
    await dropdown.locator('[data-menu-id="export-png"]').click();
    await expect
      .poll(async () =>
        (await postedMessages(page))
          .filter((message) => message.type === 'export')
          .map((message) => message.format),
      )
      .toEqual(['svg', 'png']);
  });

  test('the keyboard shortcuts dialog opens from Help, closes on Escape and backdrop', async ({
    page,
  }) => {
    await openWebview(page);
    const trigger = page.locator('[data-chrome="menu"]');
    const dialog = page.locator('.cd-shell dialog.event-storming-shortcuts');

    for (const close of ['Escape', 'backdrop'] as const) {
      const dropdown = await openMenu(page);
      await dropdown.locator('[data-menu-id="keyboard-shortcuts"]').click();
      await expect(dialog).toHaveAttribute('open', '');
      await expect(dialog).toBeVisible();
      const labelledBy = await dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      await expect(page.locator(`[id="${labelledBy}"]`)).toHaveText('Keyboard shortcuts');
      expect(await dialog.evaluate((element) => getComputedStyle(element).zIndex)).toBe('50');
      await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();

      if (close === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(4, 4);
      await expect(dialog).not.toHaveAttribute('open', '');
      await expect(trigger).toBeFocused();
    }
  });

  test('palette entries name their tool and expose its key', async ({ page }) => {
    await openWebview(page);
    const entries = [
      { action: 'lasso-tool', label: 'Lasso', key: 'L' },
      { action: 'create.event', label: 'Domain event', key: 'E' },
      { action: 'create.command', label: 'Command', key: 'C' },
    ];
    for (const { action, label, key } of entries) {
      const entry = page.locator(`.djs-palette[data-chrome="palette"] [data-action="${action}"]`);
      await expect(entry).toHaveAttribute('aria-keyshortcuts', key);
      await expect(entry).toHaveAttribute('aria-label', label);
    }
  });
});
