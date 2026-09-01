import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import { append as svgAppend, create as svgCreate, attr as svgAttr } from 'tiny-svg';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ElementLike, ShapeLike, ConnectionLike } from 'diagram-js/lib/model/Types';
import type { Point } from 'diagram-js/lib/util/Types';
import {
  COLORS,
  DRAWING_INK,
  FONT,
  NOTE_STYLE,
  STICKY_CHAR_WIDTH,
  STICKY_LINE_HEIGHT,
  STICKY_PADDING,
  STICKY_RADIUS,
  STICKY_STYLES,
} from './styles.js';
import {
  isEventStormingConnection,
  isEventStormingShape,
  isStickyKind,
  type EventStormingConnection,
  type EventStormingShape,
} from '../model/di-types.js';
import type EventStormingViewOptions from '../view-options/EventStormingViewOptions.js';

/** BaseRenderer default is 1000; 1500 wins the render.shape/render.connection event. */
const RENDER_PRIORITY = 1500;

/** Hotspots stand out with a slight tilt (rotated around the sticky center). */
const HOTSPOT_ROTATION_DEG = -3;

/** Class of the small kind caption at a sticky's bottom (selector contract for tests/e2e). */
export const KIND_CAPTION_CLASS = 'event-storming-kind-caption';

/** Caption typography: small and light so it never competes with the user's label. */
const CAPTION_FONT_SIZE = 9;
const CAPTION_FONT_WEIGHT = 300;
const CAPTION_FILL = '#606060';
/** Caption baseline sits this many px above the sticky's bottom edge. */
const CAPTION_BOTTOM_OFFSET = 7;

/** Soft drop shadow that makes stickies read as paper on the board (defs id, per canvas SVG). */
export const STICKY_SHADOW_FILTER_ID = 'event-storming-sticky-shadow';

/**
 * Installs the shadow filter into the owning SVG's defs (once per SVG — the export clones the
 * whole SVG, so the defs travel into saved files). Returns false while the visual group is not
 * attached yet: a `filter="url(#…)"` pointing at a missing def would make the element invisible,
 * so callers must only reference the filter when this succeeded.
 */
function ensureStickyShadowFilter(visuals: SVGElement): boolean {
  const svg = visuals.closest('svg');
  if (!svg) return false;
  if (svg.querySelector(`#${STICKY_SHADOW_FILTER_ID}`)) return true;
  const drop = svgAttr(svgCreate('feDropShadow'), {
    dx: 1,
    dy: 2,
    stdDeviation: 2,
    'flood-color': '#000000',
    'flood-opacity': 0.2,
  });
  const filter = svgAttr(svgCreate('filter'), { id: STICKY_SHADOW_FILTER_ID });
  svgAppend(filter, drop);
  const defs = svgCreate('defs');
  svgAppend(defs, filter);
  svg.insertBefore(defs, svg.firstChild);
  return true;
}

type Attrs = Record<string, string | number>;

export default class EventStormingRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'eventStormingViewOptions'];

  constructor(
    eventBus: EventBus,
    private readonly viewOptions: EventStormingViewOptions,
  ) {
    super(eventBus, RENDER_PRIORITY);
  }

  override canRender(element: ElementLike): boolean {
    return isEventStormingShape(element) || isEventStormingConnection(element);
  }

  override drawShape(visuals: SVGElement, element: ShapeLike): SVGElement {
    const shape = element as unknown as EventStormingShape;
    if (shape.eventStormingType === 'drawing') return this.drawDrawing(visuals, shape);
    return this.drawSticky(visuals, shape);
  }

  /** Freeform drawing: polyline/polygon from relative points (see EventStormingDrawTool). */
  private drawDrawing(visuals: SVGElement, shape: EventStormingShape): SVGElement {
    const pts = shape.drawingPoints ?? [];
    const dash =
      shape.strokeStyle === 'dashed' ? '8 5' : shape.strokeStyle === 'dotted' ? '2 4' : undefined;
    const path = svgAttr(svgCreate(shape.closed ? 'polygon' : 'polyline'), {
      points: pts.map((p) => `${p.x},${p.y}`).join(' '),
      fill: 'none',
      stroke: shape.color ?? DRAWING_INK,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...(dash ? { 'stroke-dasharray': dash } : {}),
    });
    svgAppend(visuals, path);
    return path;
  }

  /**
   * Every sticky (and the free note) is a rounded rectangle with centered, wrapped dark text
   * inside — the label lives IN the sticky, never beside it. A user-picked `color` overrides
   * the kind's fill; the border stays the kind's own (so the type remains recognizable).
   */
  private drawSticky(visuals: SVGElement, shape: EventStormingShape): SVGElement {
    const kind = shape.eventStormingType;
    const style = isStickyKind(kind) ? STICKY_STYLES[kind] : NOTE_STYLE;

    // Hotspots are tilted like a hastily slapped-on sticky; rotate the whole visual group
    // around the center so rect and text stay together.
    let parent = visuals;
    if (kind === 'hotspot') {
      const group = svgAttr(svgCreate('g'), {
        transform: `rotate(${HOTSPOT_ROTATION_DEG} ${shape.width / 2} ${shape.height / 2})`,
      });
      svgAppend(visuals, group);
      parent = group;
    }

    const rect = svgAttr(svgCreate('rect'), {
      x: 0,
      y: 0,
      width: Math.max(shape.width, 1),
      height: Math.max(shape.height, 1),
      rx: STICKY_RADIUS,
      fill: shape.color ?? style.fill,
      stroke: style.stroke,
      'stroke-width': 1.5,
    });
    // Attribute (not tiny-svg attr, which routes `filter` into inline style) so exports carry it.
    if (ensureStickyShadowFilter(visuals)) {
      rect.setAttribute('filter', `url(#${STICKY_SHADOW_FILTER_ID})`);
    }
    svgAppend(parent, rect);

    drawStickyText(parent, shape, kind === 'note');

    // Small kind caption at the bottom — the 8 sticky kinds only (a note explains itself,
    // drawings never reach this method). Appended to `parent` so it tilts with a hotspot.
    if (isStickyKind(kind) && this.viewOptions.typeCaptionsVisible()) {
      const caption = label(
        STICKY_STYLES[kind].label,
        shape.width / 2,
        shape.height - CAPTION_BOTTOM_OFFSET,
        {
          'text-anchor': 'middle',
          'font-size': CAPTION_FONT_SIZE,
          fill: CAPTION_FILL,
        },
      );
      // Plain attributes (tiny-svg attr routes `font-weight` into inline style): the class is
      // the test/e2e selector contract, and exports must carry both as-is.
      caption.setAttribute('class', KIND_CAPTION_CLASS);
      caption.setAttribute('font-weight', String(CAPTION_FONT_WEIGHT));
      svgAppend(parent, caption);
    }
    return rect;
  }

  override drawConnection(visuals: SVGElement, element: ConnectionLike): SVGElement {
    const conn = element as unknown as EventStormingConnection;
    const [start, end] = endpoints(conn);

    const path = svgAttr(svgCreate('polyline'), {
      points: `${start.x},${start.y} ${end.x},${end.y}`,
      fill: 'none',
      stroke: COLORS.arrow,
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
    });
    svgAppend(visuals, path);
    svgAppend(visuals, connectionArrow(start, end, COLORS.arrow, 11, 5));

    // Arrow annotation (`; …`) at the midpoint.
    if (conn.linkLabel) {
      const mx = (start.x + end.x) / 2;
      const my = (start.y + end.y) / 2;
      svgAppend(
        visuals,
        label(conn.linkLabel, mx, my - 5, {
          'text-anchor': 'middle',
          'font-size': 11,
          'font-style': 'italic',
          fill: COLORS.inkSoft,
        }),
      );
    }
    return path;
  }

  override getShapePath(shape: ShapeLike): string {
    const { x, y, width, height } = shape;
    return `M${x},${y}l${width},0l0,${height}l${-width},0z`;
  }

  override getConnectionPath(connection: ConnectionLike): string {
    const [first, ...rest] = connection.waypoints;
    if (!first) return '';
    return `M${first.x},${first.y}` + rest.map((p: Point) => `L${p.x},${p.y}`).join('');
  }
}

/** Word-wraps one paragraph to `maxChars` (estimated monospace-ish width, like noteMetrics). */
function wrapParagraph(paragraph: string, maxChars: number): string[] {
  const words = paragraph.split(/\s+/).filter((w) => w.length);
  if (!words.length) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    // Hard-break unbreakable over-long words (e.g. PascalCase identifiers) into maxChars chunks —
    // an over-wide single line would spill outside the fixed sticky box.
    if (word.length > maxChars) {
      if (current) lines.push(current);
      let rest = word;
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      current = rest;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

/**
 * Centered multi-line text inside the sticky: explicit line breaks are honored, long lines are
 * word-wrapped into the padded box, and overflowing lines are clipped (fixed-size stickies never
 * grow; auto-sized notes fit via noteMetrics — only hand-shrunken note boxes clip).
 */
function drawStickyText(parent: SVGElement, shape: EventStormingShape, italic: boolean): void {
  const innerWidth = shape.width - 2 * STICKY_PADDING;
  const maxChars = Math.max(1, Math.floor(innerWidth / STICKY_CHAR_WIDTH));
  const maxLines = Math.max(
    1,
    Math.floor((shape.height - 2 * STICKY_PADDING) / STICKY_LINE_HEIGHT),
  );

  const lines = (shape.eventStormingLabel ?? '')
    .split('\n')
    .flatMap((paragraph) => wrapParagraph(paragraph, maxChars))
    .slice(0, maxLines);

  const cx = shape.width / 2;
  // Center the block of lines vertically in the box (+4 ~ baseline offset for 13px).
  const y0 = shape.height / 2 - ((lines.length - 1) * STICKY_LINE_HEIGHT) / 2 + 4;
  lines.forEach((line, i) => {
    svgAppend(
      parent,
      label(line, cx, y0 + i * STICKY_LINE_HEIGHT, {
        'text-anchor': 'middle',
        fill: COLORS.stickyText,
        ...(italic ? { 'font-style': 'italic' } : {}),
      }),
    );
  });
}

function label(content: string, x: number, y: number, attrs: Attrs = {}): SVGElement {
  const el = svgAttr(svgCreate('text'), {
    x,
    y,
    'font-family': FONT.family,
    'font-size': FONT.label,
    fill: COLORS.ink,
    ...attrs,
  });
  el.textContent = content;
  return el;
}

function connectionArrow(from: Point, to: Point, color: string, len = 10, w = 5): SVGElement {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const bx = to.x - len * Math.cos(angle);
  const by = to.y - len * Math.sin(angle);
  const points =
    `${to.x},${to.y} ` +
    `${bx - w * Math.sin(angle)},${by + w * Math.cos(angle)} ` +
    `${bx + w * Math.sin(angle)},${by - w * Math.cos(angle)}`;
  return svgAttr(svgCreate('polygon'), { points, fill: color });
}

function centerOf(s: EventStormingShape): Point {
  return { x: s.x + s.width / 2, y: s.y + s.height / 2 };
}

/** Point where the ray from the rect center towards `to` exits the (slightly padded) rect. */
function rectBoundaryPoint(s: EventStormingShape, to: Point): Point {
  const c = centerOf(s);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const halfW = s.width / 2 + 2;
  const halfH = s.height / 2 + 2;
  const t = Math.min(
    dx !== 0 ? halfW / Math.abs(dx) : Infinity,
    dy !== 0 ? halfH / Math.abs(dy) : Infinity,
  );
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * Connection endpoints from the CURRENT shape centers, cropped at the rectangle boundary
 * (line ends at the sticky's edge, arrowhead visible — independent of z-order, and correct
 * after moving, since recomputed on every render).
 */
function endpoints(conn: EventStormingConnection): [Point, Point] {
  const s = conn.source as unknown as EventStormingShape | undefined;
  const t = conn.target as unknown as EventStormingShape | undefined;
  const wp = conn.waypoints;
  if (!s || !t) {
    const a = wp[0] ?? { x: 0, y: 0 };
    return [a, wp[wp.length - 1] ?? a];
  }
  const sc = centerOf(s);
  const tc = centerOf(t);
  const start = rectBoundaryPoint(s, tc);
  const end = rectBoundaryPoint(t, sc);
  // Overlapping stickies: fall back to the raw centers instead of crossed-over crop points.
  const along = (tc.x - sc.x) * (end.x - start.x) + (tc.y - sc.y) * (end.y - start.y);
  if (along <= 0) return [sc, tc];
  return [start, end];
}
