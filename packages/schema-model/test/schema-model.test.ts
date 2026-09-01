import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_BOARD_LEVEL,
  DEFAULT_BOARD_SIZE,
  LEVEL_STICKY_KINDS,
  sortByTimeline,
  loadBoard,
  serializeBoard,
  parseBoardJSON,
  validateBoard,
  createEmptyBoard,
  type BoardLevel,
  type EventStormingBoard,
} from '../src/index.js';

const sample: EventStormingBoard = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  config: { title: 'Order Checkout', style: 'classic' },
  elements: [
    {
      id: 'event_order_placed',
      elementType: 'event',
      label: 'Order Placed',
      position: { x: 620, y: 300 },
    },
    {
      id: 'cmd_place_order',
      elementType: 'command',
      label: 'Place Order',
      position: { x: 240, y: 300 },
    },
  ],
  edges: [{ id: 'arrow_1', edgeType: 'arrow', from: 'cmd_place_order', to: 'event_order_placed' }],
};

describe('sortByTimeline', () => {
  const board: EventStormingBoard = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    config: { title: 'Timeline' },
    elements: [
      { id: 'event_late', elementType: 'event', label: 'Late', position: { x: 400, y: 100 } },
      { id: 'actor_first', elementType: 'actor', label: 'First', position: { x: -80, y: 300 } },
      { id: 'note_tie', elementType: 'note', label: 'Tie B', position: { x: 200, y: 120 } },
      { id: 'cmd_tie', elementType: 'command', label: 'Tie A', position: { x: 200, y: 120 } },
      { id: 'agg_below', elementType: 'aggregate', label: 'Below', position: { x: 200, y: 320 } },
    ],
    edges: [],
  };

  it('orders elements by x, then y, then id', () => {
    expect(sortByTimeline(board).map((el) => el.id)).toEqual([
      'actor_first',
      'cmd_tie',
      'note_tie',
      'agg_below',
      'event_late',
    ]);
  });

  it('does not mutate the board', () => {
    const before = board.elements.map((el) => el.id);
    sortByTimeline(board);
    expect(board.elements.map((el) => el.id)).toEqual(before);
  });
});

describe('DEFAULT_BOARD_SIZE', () => {
  it('frames an empty board at 1080x680', () => {
    expect(DEFAULT_BOARD_SIZE).toEqual({ width: 1080, height: 680 });
  });
});

describe('Serialization', () => {
  it('is deterministic: elements sorted by id, keys stable, coordinates rounded', () => {
    const out = serializeBoard(sample);
    expect(out.indexOf('cmd_place_order')).toBeLessThan(out.indexOf('event_order_placed'));
    expect(serializeBoard(parseBoardJSON(out))).toBe(out);
  });

  it('rounds coordinates to 3 decimal places', () => {
    const noisy = {
      ...sample,
      elements: [{ ...sample.elements[0]!, position: { x: 620.123456, y: 300.987654 } }],
    };
    expect(serializeBoard(noisy as EventStormingBoard)).toContain('620.123');
    expect(serializeBoard(noisy as EventStormingBoard)).toContain('300.988');
  });
});

describe('Validation', () => {
  it('accepts an empty board with the default title', () => {
    expect(() => validateBoard(createEmptyBoard())).not.toThrow();
    expect(createEmptyBoard().config.title).toBe('Untitled Board');
    expect(createEmptyBoard('Big Picture').config.title).toBe('Big Picture');
  });

  it('accepts all 10 element kinds', () => {
    const stickyKinds = [
      'event',
      'command',
      'actor',
      'aggregate',
      'policy',
      'readmodel',
      'external',
      'hotspot',
      'note',
    ] as const;
    const board = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      config: { title: 'All kinds' },
      elements: [
        ...stickyKinds.map((kind, index) => ({
          id: `${kind}_1`,
          elementType: kind,
          label: kind,
          position: { x: index * 180, y: 300 },
        })),
        {
          id: 'draw_1',
          elementType: 'drawing',
          label: '',
          position: { x: 0, y: 0 },
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      ],
      edges: [],
    };
    expect(() => loadBoard(board)).not.toThrow();
  });

  it('rejects edges with an unknown endpoint', () => {
    const bad = {
      ...sample,
      edges: [{ id: 'x', edgeType: 'arrow', from: 'ghost', to: 'event_order_placed' }],
    };
    expect(() => loadBoard(bad)).toThrow(/references no element/);
  });

  it('rejects an arrow targeting a note (only the 8 sticky kinds are connectable)', () => {
    const bad = {
      ...sample,
      elements: [
        ...sample.elements,
        { id: 'note_1', elementType: 'note', label: 'A note', position: { x: 0, y: 0 } },
      ],
      edges: [{ id: 'arrow_bad', edgeType: 'arrow', from: 'event_order_placed', to: 'note_1' }],
    };
    expect(() => loadBoard(bad)).toThrow(/arrows may only connect stickies/);
  });

  it('rejects an arrow starting at a drawing', () => {
    const bad = {
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'draw_1',
          elementType: 'drawing',
          label: '',
          position: { x: 0, y: 0 },
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
      ],
      edges: [{ id: 'arrow_bad', edgeType: 'arrow', from: 'draw_1', to: 'event_order_placed' }],
    };
    expect(() => loadBoard(bad)).toThrow(/arrows may only connect stickies/);
  });

  it('accepts unbounded pixel coordinates (negative and large)', () => {
    const board = {
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'note_far',
          elementType: 'note',
          label: 'Far away',
          position: { x: -2400.5, y: 99999 },
        },
      ],
    };
    expect(() => loadBoard(board)).not.toThrow();
  });

  it('rejects non-numeric coordinates', () => {
    const bad = {
      ...sample,
      elements: [{ ...sample.elements[0]!, position: { x: 'left', y: 300 } }],
    };
    expect(() => loadBoard(bad)).toThrow();
  });

  it('rejects an unknown higher schemaVersion', () => {
    expect(() => loadBoard({ ...sample, schemaVersion: 99 })).toThrow(/schemaVersion/);
  });

  it('defaults a missing schemaVersion to 1', () => {
    const { schemaVersion: _ignored, ...rest } = sample;
    expect(loadBoard(rest).schemaVersion).toBe(1);
  });

  it('rejects edge IDs that collide with element IDs (shared namespace)', () => {
    const bad = {
      ...sample,
      edges: [
        {
          id: 'cmd_place_order',
          edgeType: 'arrow',
          from: 'cmd_place_order',
          to: 'event_order_placed',
        },
      ],
    };
    expect(() => loadBoard(bad)).toThrow(/collides/);
  });

  it('rejects duplicate element ids', () => {
    const bad = { ...sample, elements: [...sample.elements, sample.elements[0]!] };
    expect(() => loadBoard(bad)).toThrow(/Duplicate element id/);
  });

  it('rejects duplicate edge ids', () => {
    const bad = { ...sample, edges: [...sample.edges, ...sample.edges] };
    expect(() => loadBoard(bad)).toThrow(/Duplicate edge id/);
  });

  it('rejects an unknown element kind', () => {
    const bad = {
      ...sample,
      elements: [{ id: 'lane_1', elementType: 'lane', label: '', position: { x: 0, y: 0 } }],
      edges: [],
    };
    expect(() => loadBoard(bad)).toThrow();
  });

  it('rejects an unknown edge type', () => {
    const bad = {
      ...sample,
      edges: [{ id: 'x', edgeType: 'link', from: 'cmd_place_order', to: 'event_order_placed' }],
    };
    expect(() => loadBoard(bad)).toThrow();
  });

  it('rejects an unknown board style', () => {
    const bad = { ...sample, config: { title: 'Order Checkout', style: 'neon' } };
    expect(() => loadBoard(bad)).toThrow();
  });

  it('accepts a labeled arrow', () => {
    const board = {
      ...sample,
      edges: [{ ...sample.edges[0]!, label: 'async' }],
    };
    expect(() => loadBoard(board)).not.toThrow();
  });

  it('accepts a drawing with points, closed and strokeStyle', () => {
    const board = {
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'draw_outline',
          elementType: 'drawing',
          label: '',
          position: { x: 100, y: 100 },
          points: [
            { x: 100, y: 100 },
            { x: 200, y: 150 },
            { x: 180, y: 240 },
          ],
          closed: true,
          strokeStyle: 'dashed',
        },
      ],
    };
    expect(() => loadBoard(board)).not.toThrow();
  });

  it('accepts each of the three board levels', () => {
    for (const level of ['big-picture', 'process', 'design'] as const) {
      const board = { ...sample, config: { ...sample.config, level } };
      expect(loadBoard(board).config.level).toBe(level);
    }
  });

  it('rejects an unknown board level', () => {
    const bad = { ...sample, config: { ...sample.config, level: 'overview' } };
    expect(() => loadBoard(bad)).toThrow();
  });

  it('rejects a drawing with fewer than 2 points', () => {
    const bad = {
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'draw_dot',
          elementType: 'drawing',
          label: '',
          position: { x: 100, y: 100 },
          points: [{ x: 100, y: 100 }],
        },
      ],
    };
    expect(() => loadBoard(bad)).toThrow();
  });
});

describe('Workshop levels', () => {
  it('defaults to design; createEmptyBoard and loadBoard leave an absent level unset', () => {
    expect(DEFAULT_BOARD_LEVEL).toBe('design');
    expect(createEmptyBoard().config.level).toBeUndefined();
    expect(loadBoard(sample).config.level).toBeUndefined();
  });

  it('pins the exact sticky kinds per level (annotations are not listed)', () => {
    expect(LEVEL_STICKY_KINDS['big-picture']).toEqual(['event', 'actor', 'external', 'hotspot']);
    expect(LEVEL_STICKY_KINDS['process']).toEqual([
      'event',
      'command',
      'actor',
      'policy',
      'readmodel',
      'external',
      'hotspot',
    ]);
    expect(LEVEL_STICKY_KINDS['design']).toEqual([
      'event',
      'command',
      'actor',
      'aggregate',
      'policy',
      'readmodel',
      'external',
      'hotspot',
    ]);
    const levels: BoardLevel[] = ['big-picture', 'process', 'design'];
    expect(Object.keys(LEVEL_STICKY_KINDS).sort()).toEqual([...levels].sort());
    for (const level of levels) {
      expect(LEVEL_STICKY_KINDS[level]).not.toContain('note');
      expect(LEVEL_STICKY_KINDS[level]).not.toContain('drawing');
    }
  });
});
