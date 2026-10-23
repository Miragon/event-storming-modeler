import { expect, type Page } from '@playwright/test';

/**
 * The shell kit's default sizes (wide, narrow, very narrow), led by one where the example board
 * fits whole at 100 %: the cases that open a single size take the first. At 1280 × 900 the board
 * fits at 84 %, from where one zoom step of diagram-js's raster lands on exactly 100 %, so the
 * labelEditor case's Cmd/Ctrl+0 after its Cmd/Ctrl+Plus would change nothing and prove nothing.
 */
export const SHELL_KIT_SIZES = [
  { width: 1600, height: 900 },
  { width: 1280, height: 900 },
  { width: 720, height: 700 },
  { width: 420, height: 700 },
] as const;

/** The centre of a domain event's sticky that a pointer reaches, no chrome or sticky above it. */
async function reachableDomainEvent(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const events = document.querySelectorAll<SVGGElement>(
      '.djs-container .djs-shape[data-element-id^="event_"]',
    );
    for (const sticky of events) {
      const box = sticky.querySelector('.djs-hit')?.getBoundingClientRect();
      if (!box) continue;
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      if (document.elementFromPoint(x, y)?.closest('[data-element-id]') === sticky) return { x, y };
    }
    return null;
  });
  if (!point) throw new Error('the canvas shows no domain event a pointer reaches');
  return point;
}

let typedLabels = 0;

/**
 * The shell kit's `labelEditor.open`: a double-click on a domain event opens its label editor,
 * then a label the sticky does not hold yet is typed over the selected text, without committing.
 * Every call types another label, so one a step committed is never typed again.
 */
export async function typeIntoStickyLabel(page: Page): Promise<string> {
  const { x, y } = await reachableDomainEvent(page);
  await page.mouse.dblclick(x, y);
  const field = page.locator('textarea.event-storming-label-textarea');
  await expect(field).toBeFocused();
  typedLabels += 1;
  const typed = `Typed label ${typedLabels}`;
  await page.keyboard.type(typed);
  await expect(field).toHaveValue(typed);
  return typed;
}
