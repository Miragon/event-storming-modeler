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

/**
 * Each annotation stands between two stickies and reaches past both: the board's left edge, and its
 * right edge, where the slant of the italic is the last thing drawn.
 */
export const ANNOTATED_BOARD = [
  'title Annotated',
  'command Place Order [100, 100]',
  'event Order Placed [100, 400]',
  'command Ship Order [1500, 100]',
  'event Order Shipped [1500, 400]',
  'Place Order -> Order Placed; a very long arrow annotation that runs far wider than either sticky',
  'Ship Order -> Order Shipped; another long annotation that is the right edge of the whole board',
].join('\n');

/**
 * Holds every Geist file the page asks for back by a second, as a slow network would, so that a
 * board opens before the font it measures its annotations in. Gives how many it held back.
 */
export async function delayGeist(page: Page): Promise<() => number> {
  let delayed = 0;
  await page.route(/geist.*\.woff2/i, async (route) => {
    delayed += 1;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  return () => delayed;
}

/** Whether the annotations are drawn in Geist by now, not in the fallback. */
export function geistDrawsAnnotations(page: Page): Promise<boolean> {
  return page.evaluate(() => document.fonts.check('italic 11px "Geist Variable"', 'annotation'));
}

interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface FitFacts {
  /** The box around everything the board draws, in container px. */
  content: ScreenBox;
  /** The container minus the shell's fit insets. */
  free: ScreenBox;
  zoom: number;
}

interface FitPage {
  modeler?: { diagram: FitDiagram };
  shell?: FitShell;
  __eventStormingViewer?: FitDiagram;
  __eventStormingApp?: { shell: FitShell };
}
interface FitDiagram {
  get(name: 'canvas'): {
    viewbox(): { scale: number };
    getSize(): { width: number; height: number };
    getContainer(): HTMLElement;
  };
}
interface FitShell {
  fitInsets(): { top: number; right: number; bottom: number; left: number };
}

/**
 * Where the board stands in the free rectangle, in the webview or the web app. The content is
 * read from what the canvas draws, not from the shapes: an arrow annotation can reach past every
 * sticky.
 */
async function fitFacts(page: Page): Promise<FitFacts> {
  return page.evaluate(() => {
    const host = window as unknown as FitPage;
    const diagram = host.modeler?.diagram ?? host.__eventStormingViewer;
    const shell = host.shell ?? host.__eventStormingApp?.shell;
    if (!diagram || !shell) throw new Error('no board and no shell on the page');
    const canvas = diagram.get('canvas');
    const container = canvas.getContainer();
    const origin = container.getBoundingClientRect();
    const drawn = [
      ...container.querySelectorAll('.djs-shape > .djs-visual, .djs-connection > .djs-visual'),
    ].map((visual) => visual.getBoundingClientRect());
    if (drawn.length === 0) throw new Error('the board draws nothing');
    const size = canvas.getSize();
    const insets = shell.fitInsets();
    return {
      content: {
        left: Math.min(...drawn.map((box) => box.left)) - origin.left,
        top: Math.min(...drawn.map((box) => box.top)) - origin.top,
        right: Math.max(...drawn.map((box) => box.right)) - origin.left,
        bottom: Math.max(...drawn.map((box) => box.bottom)) - origin.top,
      },
      free: {
        left: insets.left,
        top: insets.top,
        right: size.width - insets.right,
        bottom: size.height - insets.bottom,
      },
      zoom: canvas.viewbox().scale,
    };
  });
}

/**
 * Guide §5.9: the fitted board stands centred in the free rectangle and, below 100 %, touches it
 * on one axis, so the shell's insets are its only margin (content bounds with a padding would
 * leave a gap).
 */
export async function expectFittedToContentBounds(page: Page): Promise<void> {
  const { content, free, zoom } = await fitFacts(page);
  expect(content.left).toBeGreaterThanOrEqual(free.left - 1);
  expect(content.top).toBeGreaterThanOrEqual(free.top - 1);
  expect(content.right).toBeLessThanOrEqual(free.right + 1);
  expect(content.bottom).toBeLessThanOrEqual(free.bottom + 1);
  expect(Math.abs(content.left + content.right - free.left - free.right)).toBeLessThan(2);
  expect(Math.abs(content.top + content.bottom - free.top - free.bottom)).toBeLessThan(2);
  if (zoom < 0.999) {
    const gap = Math.min(content.left - free.left, content.top - free.top);
    expect(gap).toBeLessThan(1);
  }
}
