import type Canvas from 'diagram-js/lib/core/Canvas';
import { DEFAULT_BOARD_SIZE } from '@miragon/event-storming-schema-model';

export interface SvgBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Serializes the current canvas into standalone SVG (snapshot/export).
 * `bounds` is the framing box (typically `BoardBounds.contentBounds()`), so the whole board is
 * exported wherever its stickies sit on the free canvas; if omitted, the empty-board default
 * framing is used. Independent of the current zoom/scroll.
 */
export function saveSVG(canvas: Canvas, bounds?: SvgBounds): { svg: string } {
  const container = canvas.getContainer();
  const source = container.querySelector('svg');
  if (!source) throw new Error('No SVG found in the canvas container.');

  const clone = source.cloneNode(true) as SVGSVGElement;

  const box = bounds ?? { x: 0, y: 0, ...DEFAULT_BOARD_SIZE };
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
  clone.setAttribute('width', String(box.width));
  clone.setAttribute('height', String(box.height));

  // diagram-js sets a viewbox transform on the outermost layer; for the static export we
  // neutralize pan/zoom by letting the viewBox (above) determine the geometry.
  const viewport = clone.querySelector<SVGGElement>('.viewport');
  if (viewport) viewport.removeAttribute('transform');

  const svg = new XMLSerializer().serializeToString(clone);
  return { svg: '<?xml version="1.0" encoding="utf-8"?>\n' + svg };
}
