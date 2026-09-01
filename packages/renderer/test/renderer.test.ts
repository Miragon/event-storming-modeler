// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ShapeLike } from 'diagram-js/lib/model/Types';
import EventStormingRenderer, { KIND_CAPTION_CLASS } from '../src/draw/EventStormingRenderer.js';
import type EventStormingViewOptions from '../src/view-options/EventStormingViewOptions.js';
import { STICKY_KINDS } from '../src/model/di-types.js';
import {
  STICKY_CHAR_WIDTH,
  STICKY_PADDING,
  STICKY_STYLES,
  noteMetrics,
} from '../src/draw/styles.js';

function renderer(captionsVisible = true): EventStormingRenderer {
  const viewOptions = {
    typeCaptionsVisible: () => captionsVisible,
  } as unknown as EventStormingViewOptions;
  return new EventStormingRenderer({ on: () => {} } as unknown as EventBus, viewOptions);
}

function draw(shape: Record<string, unknown>, captionsVisible = true): SVGElement {
  const visuals = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  renderer(captionsVisible).drawShape(visuals, shape as unknown as ShapeLike);
  return visuals;
}

/** The user's label lines only — the kind caption is asserted separately. */
function textLines(visuals: SVGElement): string[] {
  return [...visuals.querySelectorAll(`text:not(.${KIND_CAPTION_CLASS})`)].map(
    (t) => t.textContent ?? '',
  );
}

describe('EventStormingRenderer: note text', () => {
  // Regression: noteMetrics padded with 6px while the renderer clipped with 8px padding, so
  // every multi-line note rendered one line short.
  it.each([2, 3, 5])('renders all %i lines of a noteMetrics-sized note', (lineCount) => {
    const label = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`).join('\n');
    const { width, height } = noteMetrics(label);
    const visuals = draw({
      eventStormingType: 'note',
      eventStormingLabel: label,
      x: 0,
      y: 0,
      width,
      height,
    });
    expect(textLines(visuals)).toHaveLength(lineCount);
  });
});

describe('EventStormingRenderer: unbreakable words on fixed stickies', () => {
  // Regression: a single word longer than the line width was emitted as one over-wide centered
  // line, spilling outside the sticky (and into SVG exports).
  it('hard-breaks a long identifier into lines that fit the sticky width', () => {
    const { width, height } = STICKY_STYLES.event;
    const maxChars = Math.floor((width - 2 * STICKY_PADDING) / STICKY_CHAR_WIDTH);
    const visuals = draw({
      eventStormingType: 'event',
      eventStormingLabel: 'CustomerPaymentReconciliationJob',
      x: 0,
      y: 0,
      width,
      height,
    });
    const lines = textLines(visuals);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('CustomerPaymentReconciliationJob');
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(maxChars);
  });
});

describe('EventStormingRenderer: drawing ink', () => {
  const drawingShape = {
    eventStormingType: 'drawing',
    eventStormingLabel: '',
    x: 0,
    y: 0,
    width: 50,
    height: 50,
    drawingPoints: [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ],
  };

  // Regression: default drawings stroked a fixed near-black, invisible on `style dark` boards.
  it('strokes default-colored drawings with the theme-aware ink variable (light fallback)', () => {
    const visuals = draw(drawingShape);
    const stroke = visuals.querySelector('polyline')!.style.stroke;
    expect(stroke).toContain('var(--event-storming-drawing-ink');
    expect(stroke.toLowerCase()).toContain('#1d1d1d');
  });

  it('keeps a user-picked color as a plain stroke', () => {
    const visuals = draw({ ...drawingShape, color: '#00e676' });
    const stroke = visuals.querySelector('polyline')!.style.stroke;
    expect(stroke).not.toContain('var(');
    expect(stroke).toBe('rgb(0, 230, 118)');
  });
});

describe('EventStormingRenderer: type captions', () => {
  function stickyOf(kind: string): Record<string, unknown> {
    const { width, height } = STICKY_STYLES[kind as keyof typeof STICKY_STYLES];
    return { eventStormingType: kind, eventStormingLabel: 'Some Label', x: 0, y: 0, width, height };
  }

  function captionsIn(visuals: SVGElement): SVGElement[] {
    return [...visuals.querySelectorAll<SVGElement>(`text.${KIND_CAPTION_CLASS}`)];
  }

  it.each(STICKY_KINDS)('captions a %s sticky with its kind label', (kind) => {
    const captions = captionsIn(draw(stickyOf(kind)));
    expect(captions).toHaveLength(1);
    expect(captions[0]!.textContent).toBe(STICKY_STYLES[kind].label);
  });

  it('draws the caption small, light and centered just above the bottom edge', () => {
    const shape = stickyOf('event');
    const caption = captionsIn(draw(shape))[0]!;
    expect(caption.getAttribute('x')).toBe(String((shape['width'] as number) / 2));
    expect(caption.getAttribute('y')).toBe(String((shape['height'] as number) - 7));
    expect(caption.style.textAnchor).toBe('middle');
    expect(caption.style.fontSize).toBe('9px');
    expect(caption.style.fill).toBe('rgb(96, 96, 96)');
    // Plain attribute (not inline style) so exports and e2e selectors see it directly.
    expect(caption.getAttribute('font-weight')).toBe('300');
  });

  it('puts the hotspot caption inside the rotated group so it tilts along', () => {
    const visuals = draw(stickyOf('hotspot'));
    const caption = captionsIn(visuals)[0]!;
    expect((caption.parentElement as Element | null)?.getAttribute('transform')).toContain(
      'rotate(',
    );
  });

  it('leaves notes and drawings caption-free', () => {
    // Control: a sticky drawn the same way DOES caption — the zero counts below are meaningful.
    expect(captionsIn(draw(stickyOf('event')))).toHaveLength(1);
    const note = draw({
      eventStormingType: 'note',
      eventStormingLabel: 'free text',
      x: 0,
      y: 0,
      width: 100,
      height: 60,
    });
    expect(captionsIn(note)).toHaveLength(0);
    const drawing = draw({
      eventStormingType: 'drawing',
      eventStormingLabel: '',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      drawingPoints: [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
      ],
    });
    expect(captionsIn(drawing)).toHaveLength(0);
  });

  it('suppresses the caption when the view options say hidden', () => {
    const shape = stickyOf('command');
    // Control: the same shape captions while visible…
    expect(captionsIn(draw(shape))).toHaveLength(1);
    // …and loses ONLY the caption when hidden — the user's label is untouched by the toggle.
    const hidden = draw(shape, false);
    expect(captionsIn(hidden)).toHaveLength(0);
    expect(textLines(hidden)).toEqual(['Some Label']);
  });
});

describe('EventStormingRenderer: sticky shadow', () => {
  function drawAttached(shape: Record<string, unknown>, svg?: SVGSVGElement) {
    const root = svg ?? document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const visuals = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    root.appendChild(visuals);
    renderer().drawShape(visuals, shape as unknown as ShapeLike);
    return { root, visuals };
  }
  const sticky = (label = 'A') => ({
    eventStormingType: 'event',
    eventStormingLabel: label,
    x: 0,
    y: 0,
    width: 130,
    height: 90,
  });

  it('gives stickies a drop-shadow filter and installs the defs once per SVG', () => {
    const { root, visuals } = drawAttached(sticky());
    expect(visuals.querySelector('rect')!.getAttribute('filter')).toBe(
      'url(#event-storming-sticky-shadow)',
    );
    drawAttached(sticky('B'), root);
    expect(root.querySelectorAll('#event-storming-sticky-shadow')).toHaveLength(1);
    expect(root.querySelector('defs filter feDropShadow')).not.toBeNull();
  });

  it('leaves drawings without a shadow and skips the filter on detached groups', () => {
    const { visuals } = drawAttached({
      eventStormingType: 'drawing',
      x: 0,
      y: 0,
      width: 50,
      height: 50,
      drawingPoints: [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
      ],
    });
    expect(visuals.querySelector('polyline')!.getAttribute('filter')).toBeNull();
    // Detached visuals (no owning SVG): referencing a missing def would hide the element.
    const detached = draw(sticky());
    expect(detached.querySelector('rect')!.getAttribute('filter')).toBeNull();
  });
});
