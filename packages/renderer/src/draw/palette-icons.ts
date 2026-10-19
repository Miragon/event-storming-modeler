import { NOTE_STYLE, STICKY_STYLES } from './styles.js';
import { STICKY_KINDS } from '../model/di-types.js';

/**
 * Palette icons: the creating entries are a mini preview of the ACTUAL canvas rendering
 * (WYSIWYG) — the same colored squares the EventStormingRenderer draws, so the palette shows
 * what will be created. The tools use the common Lucide icons of the Miragon modelers.
 */

const wrap = (inner: string): string =>
  `<svg width="24" height="24" viewBox="0 0 24 24" class="event-storming-palette-svg">${inner}</svg>`;

const stickySquare = (fill: string, stroke: string, tilt = 0): string =>
  wrap(
    `<rect x="4" y="5" width="16" height="14" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${
      tilt ? ` transform="rotate(${tilt} 12 12)"` : ''
    }/>`,
  );

/**
 * Lucide outline icon (lucide-static 1.59.0, ISC) at the palette tool size: it draws in
 * `currentColor`, so the chrome around the entry decides the colour (hover, pressed tool).
 */
const toolIcon = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" class="event-storming-palette-svg">${inner}</svg>`;

const LUCIDE_SQUARE_DASHED_MOUSE_POINTER =
  '<path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/>' +
  '<path d="M5 3a2 2 0 0 0-2 2"/>' +
  '<path d="M19 3a2 2 0 0 1 2 2"/>' +
  '<path d="M5 21a2 2 0 0 1-2-2"/>' +
  '<path d="M9 3h1"/>' +
  '<path d="M9 21h2"/>' +
  '<path d="M14 3h1"/>' +
  '<path d="M3 9v1"/>' +
  '<path d="M21 9v2"/>' +
  '<path d="M3 14v1"/>';

// Lucide's spline with a straight segment between its end points (the shell's line-segment): the
// curve read as a telephone receiver at 20px.
const LINE_SEGMENT =
  '<circle cx="19" cy="5" r="2"/>' +
  '<circle cx="5" cy="19" r="2"/>' +
  '<path d="M6.5 17.5 17.5 6.5"/>';

export const PALETTE_ICONS: Record<string, string> = {
  draw: toolIcon(LINE_SEGMENT),
  lasso: toolIcon(LUCIDE_SQUARE_DASHED_MOUSE_POINTER),
  note: stickySquare(NOTE_STYLE.fill, NOTE_STYLE.stroke),
};

// One colored square per sticky kind — the hotspot preview carries the canvas tilt.
for (const kind of STICKY_KINDS) {
  const style = STICKY_STYLES[kind];
  PALETTE_ICONS[kind] = stickySquare(style.fill, style.stroke, kind === 'hotspot' ? -6 : 0);
}

/** Small colored square for the change-type popup menu entries. */
export function kindSquare(fill: string, stroke: string): string {
  return `<svg width="14" height="14" viewBox="0 0 14 14" class="event-storming-palette-svg"><rect x="1" y="1" width="12" height="12" fill="${fill}" stroke="${stroke}" stroke-width="1"/></svg>`;
}
