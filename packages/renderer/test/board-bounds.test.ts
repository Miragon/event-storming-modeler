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

  it('covers the tilt of a hotspot, which reaches past its own box', () => {
    const bounds = boundsFor([
      { id: 'hotspot_a', eventStormingType: 'hotspot', x: 0, y: 0, width: 130, height: 90 },
    ]).contentBounds(0);
    const angle = (3 * Math.PI) / 180;
    const width = 130 * Math.cos(angle) + 90 * Math.sin(angle);
    const height = 130 * Math.sin(angle) + 90 * Math.cos(angle);
    expect(bounds.x).toBeCloseTo(65 - width / 2, 9);
    expect(bounds.y).toBeCloseTo(45 - height / 2, 9);
    expect(bounds.width).toBeCloseTo(width, 9);
    expect(bounds.height).toBeCloseTo(height, 9);
    expect(bounds.width).toBeGreaterThan(130);
    expect(bounds.height).toBeGreaterThan(90);
  });

  it('covers an arrow annotation wider than the stickies it runs between', () => {
    const command = {
      id: 'command_a',
      eventStormingType: 'command',
      x: 0,
      y: 0,
      width: 130,
      height: 90,
    };
    const event = {
      id: 'event_b',
      eventStormingType: 'event',
      x: 0,
      y: 300,
      width: 130,
      height: 90,
    };
    const annotated = {
      id: 'arrow_1',
      eventStormingType: 'arrow',
      waypoints: [
        { x: 65, y: 45 },
        { x: 65, y: 345 },
      ],
      source: command,
      target: event,
      linkLabel: 'a very long arrow annotation that runs far wider than either sticky',
    };
    const bounds = boundsFor([command, event, annotated]).contentBounds(0);
    expect(bounds.x).toBeLessThan(0);
    expect(bounds.x + bounds.width).toBeGreaterThan(130);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(65, 9);
    expect(bounds.y).toBe(0);
    expect(bounds.y + bounds.height).toBe(390);

    const plain = { ...annotated, linkLabel: undefined };
    expect(boundsFor([command, event, plain]).contentBounds(0)).toEqual({
      x: 0,
      y: 0,
      width: 130,
      height: 390,
    });
  });
});
