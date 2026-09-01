import { COLORS, NOTE_STYLE, STICKY_STYLES } from './styles.js';
import { STICKY_KINDS } from '../model/di-types.js';

/**
 * Palette icons as a mini preview of the ACTUAL canvas rendering (WYSIWYG) — the same colored
 * rounded squares the EventStormingRenderer draws, so the palette shows what will be created.
 */

const wrap = (inner: string): string =>
  `<svg width="24" height="24" viewBox="0 0 24 24" class="event-storming-palette-svg">${inner}</svg>`;

const stickySquare = (fill: string, stroke: string, tilt = 0): string =>
  wrap(
    `<rect x="4" y="5" width="16" height="14" fill="${fill}" stroke="${stroke}" stroke-width="1.5"${
      tilt ? ` transform="rotate(${tilt} 12 12)"` : ''
    }/>`,
  );

export const PALETTE_ICONS: Record<string, string> = {
  // Draw tool: open zigzag polyline with the start point marked.
  draw: wrap(
    `<polyline points="3,18 8.5,7 14,14 21,4" fill="none" stroke="${COLORS.ink}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="3" cy="18" r="2.2" fill="${COLORS.surface}" stroke="${COLORS.ink}" stroke-width="1.4"/>`,
  ),
  // Selection tool: dashed lasso rectangle with a cursor arrow.
  lasso: wrap(
    `<rect x="3" y="3" width="13" height="13" rx="2" fill="none" stroke="${COLORS.ink}" stroke-width="1.5" stroke-dasharray="3 2.5"/>` +
      `<path d="M13.5 13.5l7 2.7-3 1.3-1.3 3z" fill="${COLORS.ink}"/>`,
  ),
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
