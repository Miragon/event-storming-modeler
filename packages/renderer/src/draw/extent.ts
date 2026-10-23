import type { Point } from 'diagram-js/lib/util/Types';
import { FONT, STICKY_CHAR_WIDTH } from './styles.js';
import type { EventStormingConnection, EventStormingShape } from '../model/di-types.js';

/** Hotspots stand out with a slight tilt (rotated around the sticky center). */
export const HOTSPOT_ROTATION_DEG = -3;

/** The arrow annotation (`; …`): small italic text centred above the arrow's midpoint. */
export const LINK_LABEL_FONT_SIZE = 11;
export const LINK_LABEL_RISE = 5;
/**
 * Chromium lays SVG text out at the zoomed font size and, where it snaps glyph advances to whole
 * pixels (Linux), the annotation's width changes with the zoom, by up to a fifth. With geometric
 * precision it lays the text out at its own size and scales the glyphs, so the canvas measure,
 * taken with the same setting, holds at every zoom.
 */
export const LINK_LABEL_TEXT_RENDERING = 'geometricPrecision';
const LINK_LABEL_FONT = `italic ${LINK_LABEL_FONT_SIZE}px ${FONT.family}`;

export interface DrawnBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PositionedShape {
  x: number;
  y: number;
  width: number;
  height: number;
  eventStormingType?: unknown;
}

function centerOf(shape: PositionedShape): Point {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

/** Point where the ray from the rect center towards `to` exits the (slightly padded) rect. */
function rectBoundaryPoint(shape: PositionedShape, to: Point): Point {
  const center = centerOf(shape);
  const dx = to.x - center.x;
  const dy = to.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const halfWidth = shape.width / 2 + 2;
  const halfHeight = shape.height / 2 + 2;
  const t = Math.min(
    dx !== 0 ? halfWidth / Math.abs(dx) : Infinity,
    dy !== 0 ? halfHeight / Math.abs(dy) : Infinity,
  );
  return { x: center.x + dx * t, y: center.y + dy * t };
}

/**
 * Connection endpoints from the CURRENT shape centers, cropped at the rectangle boundary
 * (line ends at the sticky's edge, arrowhead visible — independent of z-order, and correct
 * after moving, since recomputed on every render).
 */
export function connectionEndpoints(connection: EventStormingConnection): [Point, Point] {
  const source = connection.source as unknown as EventStormingShape | undefined;
  const target = connection.target as unknown as EventStormingShape | undefined;
  const waypoints = connection.waypoints;
  if (!source || !target) {
    const first = waypoints[0] ?? { x: 0, y: 0 };
    return [first, waypoints[waypoints.length - 1] ?? first];
  }
  const sourceCenter = centerOf(source);
  const targetCenter = centerOf(target);
  const start = rectBoundaryPoint(source, targetCenter);
  const end = rectBoundaryPoint(target, sourceCenter);
  // Overlapping stickies: fall back to the raw centers instead of crossed-over crop points.
  const along =
    (targetCenter.x - sourceCenter.x) * (end.x - start.x) +
    (targetCenter.y - sourceCenter.y) * (end.y - start.y);
  if (along <= 0) return [sourceCenter, targetCenter];
  return [start, end];
}

/** Where the arrow annotation's baseline is centred. */
export function linkLabelAnchor(connection: EventStormingConnection): Point {
  const [start, end] = connectionEndpoints(connection);
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - LINK_LABEL_RISE };
}

/** The box a shape covers on the canvas: a hotspot's tilt reaches past its own box. */
export function drawnShapeBox(shape: PositionedShape): DrawnBox {
  if (shape.eventStormingType !== 'hotspot') {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }
  const angle = Math.abs((HOTSPOT_ROTATION_DEG * Math.PI) / 180);
  const width = shape.width * Math.cos(angle) + shape.height * Math.sin(angle);
  const height = shape.width * Math.sin(angle) + shape.height * Math.cos(angle);
  const center = centerOf(shape);
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}

/** The box of an arrow's annotation, `undefined` for an arrow without one. */
export function linkLabelBox(connection: EventStormingConnection): DrawnBox | undefined {
  if (!connection.linkLabel) return undefined;
  const anchor = linkLabelAnchor(connection);
  const { advance, left, right, ascent, descent } = linkLabelMetrics(connection.linkLabel);
  const start = anchor.x - advance / 2;
  return { x: start + left, y: anchor.y - ascent, width: right - left, height: ascent + descent };
}

/** Horizontal extents from the text's start, where the centred advance begins. */
interface TextMetrics {
  advance: number;
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

let measuringContext: CanvasRenderingContext2D | null | undefined;

function canvasContext(): CanvasRenderingContext2D | null {
  // jsdom has no canvas and logs an error for every getContext call: ask only a real browser.
  measuringContext ??=
    typeof document !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined'
      ? document.createElement('canvas').getContext('2d')
      : null;
  return measuringContext;
}

/**
 * Resolves once the font faces the annotations `texts` are set in have loaded (or failed to);
 * `undefined` when none is pending. Their box is measured in that font: before it arrives, the
 * fallback's widths, several px off, would be what a fit frames.
 */
export function linkLabelFontLoading(texts: readonly string[]): Promise<void> | undefined {
  if (texts.length === 0 || typeof document === 'undefined' || !('fonts' in document)) {
    return undefined;
  }
  const sample = texts.join(' ');
  if (document.fonts.check(LINK_LABEL_FONT, sample)) return undefined;
  return document.fonts.load(LINK_LABEL_FONT, sample).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Only what SVG collapses: a no-break or ideographic space is drawn at its full width, where `\s`
 * would merge it away.
 */
function collapseWhiteSpace(text: string): string {
  return text.replace(/[ \t\n\r]+/g, ' ').replace(/^ | $/g, '');
}

/**
 * Measured on a 2D canvas, which needs no drawn element. The ink counts beside the advance: an
 * italic the browser slants from an upright face (Geist's default import has no italic) leans
 * about 2px past the last advance, and the SVG draws that lean.
 */
function linkLabelMetrics(text: string): TextMetrics {
  const collapsed = collapseWhiteSpace(text);
  const context = canvasContext();
  if (!context) {
    const advance = collapsed.length * LINK_LABEL_FONT_SIZE * (STICKY_CHAR_WIDTH / FONT.label);
    return {
      advance,
      left: 0,
      right: advance,
      ascent: LINK_LABEL_FONT_SIZE,
      descent: LINK_LABEL_FONT_SIZE / 4,
    };
  }
  context.font = LINK_LABEL_FONT;
  context.textRendering = LINK_LABEL_TEXT_RENDERING;
  const metrics = context.measureText(collapsed);
  return {
    advance: metrics.width,
    left: Math.min(0, -metrics.actualBoundingBoxLeft),
    right: Math.max(metrics.width, metrics.actualBoundingBoxRight),
    ascent: metrics.fontBoundingBoxAscent,
    descent: metrics.fontBoundingBoxDescent,
  };
}
