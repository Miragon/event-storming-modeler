import { expect, test, type Locator, type Page } from '@playwright/test';
import { ICONS, type ShellIconName } from '@miragon/modeler-shell';
import { EMPTY_BOARD, withExampleInserted } from '../../../apps/vscode/src/examples.js';
import {
  ANNOTATED_BOARD,
  delayGeist,
  expectFittedToContentBounds,
  geistDrawsAnnotations,
} from '../support/shell-kit.js';
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

  test('the menu holds Model (level, type captions), Export (as in the web app) and Help', async ({
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
      'export-png-transparent',
      'export-json',
      '|',
      'keyboard-shortcuts',
    ]);

    const level = dropdown.locator('[data-menu-id="level"]');
    await expect(level).toHaveAttribute('role', 'group');
    await expect(level).toHaveAttribute('aria-label', 'Level');
    const levelOptions = level.locator('[role="menuitemradio"]');
    await expect(levelOptions).toHaveText(['Big picture', 'Process modeling', 'Software design']);
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
    await expect(dropdown.locator('[data-menu-id="export-png-transparent"]')).toHaveText(
      'Export as PNG (4×, transparent)',
    );
    await expect(dropdown.locator('[data-menu-id="export-json"]')).toHaveText('Export as JSON');
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

  test('the board opens fitted, the fit insets its only margin', async ({ page }) => {
    await openWebview(page);
    await expectFittedToContentBounds(page);
  });

  test('a board opens fitted to its arrow annotations, though Geist arrives late', async ({
    page,
  }) => {
    const delayedFonts = await delayGeist(page);
    await openWebview(page, { text: ANNOTATED_BOARD });
    expect(delayedFonts()).toBeGreaterThan(0);
    expect(await geistDrawsAnnotations(page)).toBe(true);
    await expectFittedToContentBounds(page);
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
    // The board itself, not a palette icon (the chrome moves the palette in front of the canvas).
    expect(String(svg.data)).toContain('data-element-id="event_order_placed"');
    expect(String(svg.data)).not.toContain('event-storming-palette-svg');

    const dropdown = await openMenu(page);
    await dropdown.locator('[data-menu-id="export-png"]').click();
    await expect
      .poll(async () =>
        (await postedMessages(page))
          .filter((message) => message.type === 'export')
          .map((message) => message.format),
      )
      .toEqual(['svg', 'png']);

    await postFromHost(page, { type: 'command', name: 'exportPngTransparent' });
    await (await openMenu(page)).locator('[data-menu-id="export-json"]').click();
    await expect
      .poll(async () =>
        (await postedMessages(page))
          .filter((message) => message.type === 'export')
          .map((message) => message.format),
      )
      .toEqual(['svg', 'png', 'png-transparent', 'json']);
    const json = (await postedMessages(page)).find(
      (message) => message.type === 'export' && message.format === 'json',
    );
    expect(JSON.parse(String(json?.data)).config.title).toBe('Order Checkout');
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
      await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();

      if (close === 'Escape') await page.keyboard.press('Escape');
      else await page.mouse.click(4, 4);
      await expect(dialog).not.toHaveAttribute('open', '');
      await expect(trigger).toBeFocused();
    }
  });

  // Guide §6 and §8: under high contrast the dialog trades its shadow for a --cd-ui-kontur edge
  // and its focus ring grows to 3px; the shell's own contrast rules match only its classes.
  test('the keyboard shortcuts dialog follows high contrast', async ({ page }) => {
    await openWebview(page);
    await page.evaluate(() => window.__modelerShellVsCodeStub!.setColorThemeKind(3));
    await expect(page.locator('html')).toHaveAttribute('data-cd-kontrast', 'hoch');
    // opened by keyboard, so the focus ring on Close is the :focus-visible one
    await page.locator('[data-chrome="menu"]').focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-menu-id="keyboard-shortcuts"]')).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.locator('.cd-shell dialog.event-storming-shortcuts');
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();

    const painted = await page.evaluate(() => {
      const role = (name: string): string => {
        const probe = document.createElement('span');
        probe.style.color = `var(${name})`;
        document.querySelector('.cd-shell')!.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const panel = getComputedStyle(document.querySelector('dialog.event-storming-shortcuts')!);
      const close = getComputedStyle(document.querySelector('.event-storming-shortcuts-close')!);
      return {
        shadow: panel.boxShadow,
        edge: panel.borderTopColor,
        kontur: role('--cd-ui-kontur'),
        linie: role('--cd-ui-linie'),
        ring: close.outlineWidth,
      };
    });
    expect(painted.kontur).not.toBe(painted.linie);
    expect(painted).toMatchObject({ shadow: 'none', edge: painted.kontur, ring: '3px' });
  });

  // Under forced colours the panel's edge is CanvasText and the Close ring Highlight, as on the
  // shell's own popups. Chromium and the tokens' forced-colours block already paint both; this
  // fails once the dialog opts out (forced-color-adjust: none) with colours of its own.
  test('the keyboard shortcuts dialog follows forced colours', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openWebview(page);
    await page.locator('[data-chrome="menu"]').focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('[data-menu-id="keyboard-shortcuts"]')).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.locator('.cd-shell dialog.event-storming-shortcuts');
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();

    const painted = await page.evaluate(() => {
      const system = (name: string): string => {
        const probe = document.createElement('span');
        probe.style.color = name;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const panel = getComputedStyle(document.querySelector('dialog.event-storming-shortcuts')!);
      const close = getComputedStyle(document.querySelector('.event-storming-shortcuts-close')!);
      return {
        edge: panel.borderTopColor,
        ring: close.outlineColor,
        canvasText: system('CanvasText'),
        highlight: system('Highlight'),
      };
    });
    expect(painted.canvasText).not.toBe(painted.highlight);
    expect(painted).toMatchObject({ edge: painted.canvasText, ring: painted.highlight });
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

const GRUND = 'rgb(249, 247, 247)';

/** The number of stickies, notes and drawings on the board. */
function shapeCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      window
        .modeler!.diagram.get<{ getAll(): Array<{ parent?: unknown; waypoints?: unknown }> }>(
          'elementRegistry',
        )
        .getAll()
        .filter((element) => element.parent && !element.waypoints).length,
  );
}

test.describe('VS Code webview: canvas', () => {
  // Guide §10.7 and §13.5: `style dark` is kept in the text but never painted, so no navy board
  // sits under light chrome, in a light or a dark VS Code theme.
  for (const theme of ['light', 'dark'] as const) {
    test(`a \`style dark\` board stays light in a ${theme} theme`, async ({ page }) => {
      await openWebview(page, { requested: { theme } });
      await postFromHost(page, {
        type: 'update',
        text: 'title Night\nstyle dark\nevent A [0, 0]\n',
      });
      await expect(page.locator('.cd-shell-canvas .djs-element.djs-shape')).toHaveCount(1);
      const painted = await page.evaluate(() => ({
        theme: document.documentElement.getAttribute('data-cd-theme'),
        grund: getComputedStyle(document.documentElement).getPropertyValue('--cd-ui-grund').trim(),
        board: getComputedStyle(document.querySelector('.event-storming-container')!)
          .backgroundColor,
        canvas: getComputedStyle(document.querySelector('.cd-shell-canvas')!).backgroundColor,
      }));
      expect(painted).toEqual({ theme: 'light', grund: '#F9F7F7', board: GRUND, canvas: GRUND });
    });
  }

  // Guide §5.9: fit never zooms in past 100%, and an empty file has nothing to fit.
  test('an empty file opens at 100%', async ({ page }) => {
    await openWebview(page, { board: 'empty' });
    await expect(page.locator('[data-chrome="zoom"] [data-zoom="actual"]')).toHaveText('100%');
  });

  // Guide §5.8 (modeler-shell 0.2.2): a pointer click on the chrome hands the keys back to the
  // board, so Event Storming's own keys act at once; Enter leaves the focus on the control.
  test('after a pointer click on + or a palette entry, Delete acts on the board', async ({
    page,
  }) => {
    await openWebview(page);
    const canvasHasFocus = () =>
      page.evaluate(
        () =>
          document.activeElement instanceof SVGSVGElement &&
          document.activeElement.closest('.event-storming-container') !== null,
      );
    const before = await shapeCount(page);
    await page.locator('.djs-element.djs-shape[data-element-id="event_order_placed"]').click();
    const zoomIn = page.locator('[data-chrome="zoom"] [data-zoom="in"]');
    await zoomIn.click();
    expect(await canvasHasFocus()).toBe(true);
    await page.keyboard.press('Delete');
    await expect.poll(() => shapeCount(page)).toBe(before - 1);

    await zoomIn.focus();
    await page.keyboard.press('Enter');
    await expect(zoomIn).toBeFocused();

    await page.locator('.djs-palette[data-chrome="palette"] [data-action="create.event"]').click();
    const canvas = (await page.locator('.cd-shell-canvas').boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height - 140);
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height - 140);
    await expect.poll(() => shapeCount(page)).toBe(before);
    expect(await canvasHasFocus()).toBe(true);
    await page.keyboard.press('Delete');
    await expect.poll(() => shapeCount(page)).toBe(before - 1);
  });

  // Guide §5.5: a keyboard user creates stickies too.
  test('Enter on a creating palette entry adds one selected sticky with its label editor', async ({
    page,
  }) => {
    await openWebview(page, { board: 'empty' });
    const entry = page.locator('.djs-palette[data-chrome="palette"] [data-action="create.event"]');
    await entry.focus();
    await page.keyboard.press('Enter');

    // A sticky created on the canvas carries its random id in the text, so a re-open (or a peer)
    // finds it, and keeps it through a rename.
    const edit = await waitForPosted(page, 'edit');
    const text = String(edit.text);
    const created = /^event Domain Event \[[-\d.]+, [-\d.]+\] \(id (event_[0-9a-z]{8})\)$/m.exec(
      text,
    );
    expect(created, text).not.toBeNull();
    const id = created![1]!;
    expect(countOf(await postedMessages(page), 'edit')).toBe(1);
    expect(await shapeCount(page)).toBe(1);
    await expect(page.locator('.cd-shell-canvas .djs-shape.selected')).toHaveCount(1);
    await expect(page.locator('textarea.event-storming-label-textarea')).toBeFocused();

    await page.keyboard.type('Order Placed');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect.poll(async () => countOf(await postedMessages(page), 'edit')).toBe(2);
    expect((await waitForPosted(page, 'edit')).text).toMatch(
      new RegExp(`^event Order Placed \\[[-\\d.]+, [-\\d.]+\\] \\(id ${id}\\)$`, 'm'),
    );
  });

  test('Cmd/Ctrl+A on the canvas selects the whole board and never reaches VS Code', async ({
    page,
  }) => {
    await openWebview(page);
    await page.evaluate(() => {
      const seen: boolean[] = [];
      (window as unknown as { selectAllAtWindow: boolean[] }).selectAllAtWindow = seen;
      window.addEventListener('keydown', (event) => {
        if (event.key === 'a') seen.push(event.defaultPrevented);
      });
    });
    await page.locator('.cd-shell-canvas svg[role="application"]').focus();
    await page.keyboard.press('ControlOrMeta+a');

    // Stopped before window, or at least prevented: VS Code runs no Select All of its own.
    const atWindow = await page.evaluate(
      () => (window as unknown as { selectAllAtWindow: boolean[] }).selectAllAtWindow,
    );
    expect(atWindow.every((prevented) => prevented)).toBe(true);
    await expect(page.locator('.cd-shell-canvas .djs-shape.selected')).toHaveCount(
      await shapeCount(page),
    );
  });

  // An invalid file (guide §13.5): the canvas keeps the last valid board and edits nothing until
  // the text is valid again. The DSL reads every text today, so the test makes one import fail.
  test('a failed import locks the canvas: no context pad, no delete, no edit', async ({ page }) => {
    await openWebview(page);
    await page.evaluate(() => {
      const modeler = window.modeler!;
      const importText = modeler.importText.bind(modeler);
      modeler.importText = () => {
        modeler.importText = importText;
        return Promise.reject(new Error('not importable'));
      };
    });
    await postFromHost(page, { type: 'update', text: 'title Broken\n' });
    await expect(page.locator('[data-chrome="status"]')).toBeVisible();

    const sticky = page.locator(
      '.cd-shell-canvas .djs-shape[data-element-id="event_order_placed"]',
    );
    await sticky.click();
    await expect(page.locator('.cd-shell-canvas .djs-shape.selected')).toHaveCount(1);
    await expect(page.locator('.djs-context-pad .entry')).toHaveCount(0);
    const shapes = await shapeCount(page);
    await page.keyboard.press('Delete');
    await sticky.dblclick();
    await expect(page.locator('textarea.event-storming-label-textarea')).toHaveCount(0);
    expect(await shapeCount(page)).toBe(shapes);
    expect(countOf(await postedMessages(page), 'edit')).toBe(0);

    // The next valid import lifts the lock (a click on a selected sticky deselects it, so start
    // from an empty selection).
    await postFromHost(page, { type: 'update', text: withExampleInserted(EMPTY_BOARD) });
    await expect(page.locator('[data-chrome="status"]')).toBeHidden();
    await page.evaluate(() =>
      window.modeler!.diagram.get<{ select(elements: unknown): void }>('selection').select(null),
    );
    await sticky.click();
    await expect(page.locator('.djs-context-pad .entry').first()).toBeVisible();
  });
});
