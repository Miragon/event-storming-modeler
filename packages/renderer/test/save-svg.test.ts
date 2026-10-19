// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import { saveSVG } from '../src/io/saveSvg.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A diagram-js container as a host's chrome leaves it: the palette in front of the canvas. */
function containerWithPaletteFirst(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'djs-container';
  const palette = document.createElement('div');
  palette.className = 'djs-palette';
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('class', 'event-storming-palette-svg');
  palette.append(icon);
  const board = document.createElementNS(SVG_NS, 'svg');
  board.setAttribute('tabindex', '0');
  board.setAttribute('role', 'application');
  board.setAttribute('aria-label', 'Event Storming board');
  const viewport = document.createElementNS(SVG_NS, 'g');
  viewport.setAttribute('class', 'viewport');
  viewport.setAttribute('transform', 'matrix(2 0 0 2 10 10)');
  const sticky = document.createElementNS(SVG_NS, 'g');
  sticky.setAttribute('data-element-id', 'event_order_placed');
  viewport.append(sticky);
  board.append(viewport);
  container.append(palette, board);
  return container;
}

describe('saveSVG', () => {
  it('exports the canvas, not a palette icon that comes first in the container', () => {
    const container = containerWithPaletteFirst();
    const canvas = { getContainer: () => container } as unknown as Canvas;

    const { svg } = saveSVG(canvas, { x: -10, y: 20, width: 300, height: 200 });

    expect(svg).toContain('data-element-id="event_order_placed"');
    expect(svg).not.toContain('event-storming-palette-svg');
    expect(svg).toContain('viewBox="-10 20 300 200"');
    expect(svg).not.toContain('matrix(2 0 0 2 10 10)');
  });

  it('leaves the live canvas’s focus and screen reader attributes out of the picture', () => {
    const container = containerWithPaletteFirst();
    const canvas = { getContainer: () => container } as unknown as Canvas;

    const { svg } = saveSVG(canvas);

    expect(svg).not.toMatch(/tabindex|role=|aria-label/);
    const board = container.querySelector(':scope > svg')!;
    expect(board.getAttribute('role')).toBe('application');
    expect(board.getAttribute('tabindex')).toBe('0');
  });
});
