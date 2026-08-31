import { describe, it, expect } from 'vitest';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import { DEFAULT_BOARD_SIZE } from '@miragon/event-storming-schema-model';
import BoardBounds from '../src/board-bounds/BoardBounds.js';
import { ROOT_ID } from '../src/io/types.js';

function boundsFor(elements: Array<Record<string, unknown>>): BoardBounds {
  const registry = { getAll: () => elements } as unknown as ElementRegistry;
  return new BoardBounds(registry);
}

describe('BoardBounds.contentBounds', () => {
  it('falls back to the default board framing on an empty board', () => {
    expect(boundsFor([]).contentBounds()).toEqual({ x: 0, y: 0, ...DEFAULT_BOARD_SIZE });
  });

  it('pads the bbox over all shapes (default padding 120)', () => {
    const bounds = boundsFor([
      { id: 'event_a', x: 100, y: 200, width: 130, height: 90 },
      { id: 'cmd_b', x: 500, y: 50, width: 130, height: 90 },
    ]).contentBounds();
    expect(bounds).toEqual({
      x: 100 - 120,
      y: 50 - 120,
      width: 500 + 130 - 100 + 240,
      height: 200 + 90 - 50 + 240,
    });
  });

  it('honors a custom padding', () => {
    const bounds = boundsFor([{ id: 'event_a', x: 0, y: 0, width: 100, height: 50 }]).contentBounds(
      10,
    );
    expect(bounds).toEqual({ x: -10, y: -10, width: 120, height: 70 });
  });

  it('ignores the root element and connections', () => {
    const bounds = boundsFor([
      { id: ROOT_ID },
      { id: 'arrow_1', waypoints: [{ x: -900, y: -900 }], x: -900, y: -900, width: 1, height: 1 },
      { id: 'event_a', x: 0, y: 0, width: 130, height: 90 },
    ]).contentBounds(0);
    expect(bounds).toEqual({ x: 0, y: 0, width: 130, height: 90 });
  });

  it('handles negative coordinates (the canvas is unbounded)', () => {
    const bounds = boundsFor([
      { id: 'event_a', x: -300, y: -100, width: 130, height: 90 },
    ]).contentBounds(0);
    expect(bounds).toEqual({ x: -300, y: -100, width: 130, height: 90 });
  });
});
