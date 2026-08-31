// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ShapeLike } from 'diagram-js/lib/model/Types';
import EventStormingRenderer from '../src/draw/EventStormingRenderer.js';
import {
  STICKY_CHAR_WIDTH,
  STICKY_PADDING,
  STICKY_STYLES,
  noteMetrics,
} from '../src/draw/styles.js';

function renderer(): EventStormingRenderer {
  return new EventStormingRenderer({ on: () => {} } as unknown as EventBus);
}

function draw(shape: Record<string, unknown>): SVGElement {
  const visuals = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  renderer().drawShape(visuals, shape as unknown as ShapeLike);
  return visuals;
}

function textLines(visuals: SVGElement): string[] {
  return [...visuals.querySelectorAll('text')].map((t) => t.textContent ?? '');
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
