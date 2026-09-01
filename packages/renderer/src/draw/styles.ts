/** Central rendering constants (geometry, colors, typography) — Miragon corporate identity. */

import { MIRAGON } from '../theme/index.js';
import type { StickyKind } from '../model/di-types.js';

export interface StickyStyle {
  /** Default label for a freshly created sticky. */
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly fill: string;
  readonly stroke: string;
}

/**
 * The canonical sticky-note look per kind (Brandolini's color grammar): default label, fixed
 * size and fill/border. Single source for the renderer, element factory, palette previews and
 * the color-picker swatches. Aggregate, policy and external system share the large block format —
 * they occupy the same slot in the grammar (receive commands / react to events); actors are the
 * small corner stickies.
 */
export const STICKY_STYLES: Record<StickyKind, StickyStyle> = {
  event: { label: 'Domain Event', width: 130, height: 90, fill: '#FFB84D', stroke: '#E89A2E' },
  command: { label: 'Command', width: 130, height: 90, fill: '#7EC8F0', stroke: '#4FA8D8' },
  actor: { label: 'Actor', width: 100, height: 65, fill: '#FFF9B1', stroke: '#E6DB7A' },
  aggregate: { label: 'Aggregate', width: 180, height: 110, fill: '#FFE066', stroke: '#E0BE3F' },
  policy: { label: 'Policy', width: 180, height: 110, fill: '#C9A0DC', stroke: '#A97CC4' },
  readmodel: { label: 'Read Model', width: 130, height: 90, fill: '#A8D08D', stroke: '#7FB35D' },
  external: {
    label: 'External System',
    width: 180,
    height: 110,
    fill: '#F4A6C0',
    stroke: '#DE7EA2',
  },
  hotspot: { label: 'Hotspot', width: 130, height: 90, fill: '#E85D75', stroke: '#C43B55' },
} as const;

/** Free-text note: auto-sizes to its text (see `noteMetrics`) unless resized by hand, neutral grey. */
export const NOTE_STYLE = { label: 'Note', fill: '#ECECEC', stroke: '#C4C4C4' } as const;

/** Smallest hand-resized note box — keeps a shrunken note grabbable and its handles apart. */
export const NOTE_MIN_RESIZE = { width: 60, height: 40 } as const;

/** Corner radius shared by all stickies (and the palette previews) — 0: paper has sharp corners. */
export const STICKY_RADIUS = 0;
/** Inner text padding of a sticky (px, each side). */
export const STICKY_PADDING = 8;

export const STICKY_LINE_HEIGHT = 17;
/** Estimated character width at the 13px label size — good enough for wrapping/box sizing. */
export const STICKY_CHAR_WIDTH = 7.5;
/** Minimum note box edge length (so even empty notes stay clickable). */
const NOTE_MIN_SIZE = 34;

/**
 * Box dimensions of a note from its (possibly multi-line) text. The note shape grows as large as
 * its text -> the move/click hitbox grows with it (instead of a fixed minimum box). Vertical
 * padding matches the renderer's clip padding (`STICKY_PADDING`) — a smaller padding here would
 * make the renderer's maxLines clip drop the last text line.
 */
export function noteMetrics(label: string): { lines: string[]; width: number; height: number } {
  const lines = (label && label.length ? label : 'note').split('\n');
  const maxLen = Math.max(1, ...lines.map((l) => l.length));
  return {
    lines,
    width: Math.max(NOTE_MIN_SIZE, Math.round(maxLen * STICKY_CHAR_WIDTH) + STICKY_PADDING * 2),
    height: Math.max(NOTE_MIN_SIZE, lines.length * STICKY_LINE_HEIGHT + STICKY_PADDING * 2),
  };
}

/**
 * The auto-vs-manual rule: a note box is MANUAL iff it differs from `noteMetrics(label)`.
 * Single comparison shared by the exporter (emit `size` only for manual boxes), relabel
 * (preserve manual boxes) and copy-paste (recompute only auto clones) — divergence between
 * these callers would make boards change on a plain reload.
 */
export function isManualNoteBox(label: string, box: { width: number; height: number }): boolean {
  const metrics = noteMetrics(label);
  return box.width !== metrics.width || box.height !== metrics.height;
}

/**
 * Canvas colours — Miragon palette. Keys are the public contract; brand values come from the
 * single source of truth in `theme/palette.ts` (`MIRAGON`). Referenced (not spread) so the
 * literal-string types survive into the published `.d.ts`. The sticky fills live in
 * `STICKY_STYLES` — this map only carries the non-sticky canvas colours.
 */
export const COLORS = {
  paper: MIRAGON.grau,
  ink: MIRAGON.schwarz,
  inkSoft: '#5B5B5B',
  surface: MIRAGON.weiss,
  stroke: MIRAGON.schwarz,
  /** The single connection style: gray arrowed line. */
  arrow: '#9E9E9E',
  accent: MIRAGON.blau,
  accentSoft: 'rgba(51,93,229,0.12)',
  /** Dark text inside every sticky. */
  stickyText: '#333333',
} as const;

/**
 * Default stroke for freeform drawings and the draw-tool preview: theme-aware via CSS variable
 * (dark boards flip it to a light ink — near-black on navy is invisible), with the light value as
 * literal fallback so exported SVGs opened standalone (no stylesheet) stay stable.
 */
export const DRAWING_INK = `var(--event-storming-drawing-ink, ${MIRAGON.schwarz})`;

export const FONT = {
  /**
   * Set as the `font-family` attribute DIRECTLY on all SVG text elements (canvas labels and
   * consequently the SVG export too) – not inherited from a CSS container. In EVERY context it
   * reaches for the self-hosted 'Geist' (Miragon corporate typeface) if the consumer provides it;
   * otherwise (e.g. an export SVG opened standalone) it falls back safely to a system sans. The
   * library does NOT ship the font – consumers must self-host Geist themselves
   * (e.g. via @fontsource-variable/geist), see README.
   */
  family: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
  label: 13,
} as const;
