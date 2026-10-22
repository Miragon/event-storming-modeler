import { describe, it, expect } from 'vitest';
import {
  ATTACHABLE_STICKY_KINDS,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_BOARD_LEVEL,
  LARGEST_DRAWABLE_NUMBER,
  UndrawableBoardError,
  assertDrawable,
  DEFAULT_BOARD_SIZE,
  HOST_STICKY_KINDS,
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

describe('Note size (manual resize)', () => {
  const withNote = (size: unknown) => ({
    ...sample,
    elements: [
      ...sample.elements,
      { id: 'note_1', elementType: 'note', label: 'Kickoff', position: { x: 80, y: 80 }, size },
    ],
  });

  it('accepts a note with a manual size and round-trips it through the JSON serialization', () => {
    const board = loadBoard(withNote({ width: 240, height: 160 }));
    const note = board.elements.find((el) => el.id === 'note_1');
    expect(note).toMatchObject({ size: { width: 240, height: 160 } });
    const out = serializeBoard(board);
    expect(out).toContain('"width": 240');
    expect(out).toContain('"height": 160');
    expect(serializeBoard(parseBoardJSON(out))).toBe(out);
  });

  it('rejects a zero width', () => {
    expect(() => loadBoard(withNote({ width: 0, height: 160 }))).toThrow();
  });

  it('rejects a negative height', () => {
    expect(() => loadBoard(withNote({ width: 240, height: -1 }))).toThrow();
  });
});

describe('the drawable range (±1e38, as in the .storm lexer)', () => {
  const beyond = 1e39;
  const origin = { x: 0, y: 0 };
  const withElement = (element: Record<string, unknown>) => ({
    ...sample,
    elements: [...sample.elements, element],
  });
  const event = (position: { x: number; y: number }) =>
    withElement({ id: 'event_far', elementType: 'event', label: 'Far', position });
  const drawing = (points: Array<{ x: number; y: number }>) =>
    withElement({ id: 'draw_far', elementType: 'drawing', label: '', position: origin, points });
  const note = (size: { width: number; height: number }) =>
    withElement({ id: 'note_big', elementType: 'note', label: 'Big', position: origin, size });

  function refusal(data: unknown): unknown {
    try {
      loadBoard(data);
    } catch (error) {
      return error;
    }
    return undefined;
  }

  it.each([
    ['position.x', event({ x: beyond, y: 0 }), 'event_far', beyond],
    ['position.y', event({ x: 0, y: -beyond }), 'event_far', -beyond],
    ['points[1].x', drawing([origin, { x: beyond, y: 0 }]), 'draw_far', beyond],
    ['size.width', note({ width: beyond, height: 10 }), 'note_big', beyond],
    ['size.height', note({ width: 10, height: beyond }), 'note_big', beyond],
    ['points[0].y', drawing([{ x: 0, y: -Infinity }, origin]), 'draw_far', -Infinity],
  ])(
    'loadBoard refuses a board with %s beyond it, naming where',
    (field, data, elementId, value) => {
      const error = refusal(data);
      expect(error).toBeInstanceOf(UndrawableBoardError);
      expect(error).toBeInstanceOf(RangeError);
      expect(error).toMatchObject({ elementId, field, value });
      expect((error as Error).message).toBe(
        `Element ${elementId}: ${field} ${value} lies beyond ±1e38, more than the canvas can draw.`,
      );
    },
  );

  it('parseBoardJSON refuses the file from issue #50', () => {
    const huge =
      '{"schemaVersion":1,"config":{"title":"Huge"},"elements":[' +
      '{"id":"event_a","label":"Near","position":{"x":100,"y":100},"elementType":"event"},' +
      '{"id":"event_b","label":"Far","position":{"x":1e39,"y":100},"elementType":"event"}' +
      '],"edges":[]}';
    expect(() => parseBoardJSON(huge)).toThrow(
      'Element event_b: position.x 1e+39 lies beyond ±1e38, more than the canvas can draw.',
    );
  });

  it('names a JSON number too large for a double, which JSON.parse reads as Infinity', () => {
    const overflow =
      '{"schemaVersion":1,"config":{"title":"Huge"},"elements":[' +
      '{"id":"note_big","label":"Big","position":{"x":0,"y":0},"elementType":"note",' +
      '"size":{"width":10,"height":1e400}}' +
      '],"edges":[]}';
    const error = refusal(JSON.parse(overflow));
    expect(error).toBeInstanceOf(UndrawableBoardError);
    expect(error).toMatchObject({ elementId: 'note_big', field: 'size.height', value: Infinity });
  });

  it('leaves an element without an id to the schema', () => {
    const error = refusal(
      withElement({ elementType: 'event', label: 'Far', position: { x: beyond, y: 0 } }),
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UndrawableBoardError);
  });

  it('reads ±1e38 itself', () => {
    const largest = LARGEST_DRAWABLE_NUMBER;
    expect(largest).toBe(1e38);
    const edges = [
      event({ x: -largest, y: largest }),
      drawing([
        { x: -largest, y: -largest },
        { x: largest, y: largest },
      ]),
      note({ width: largest, height: largest }),
    ];
    for (const data of edges) expect(refusal(data)).toBeUndefined();
  });

  it('assertDrawable checks a board that never went through loadBoard', () => {
    const board = validateBoard(event({ x: Number.MAX_VALUE, y: 0 }));
    expect(() => assertDrawable(board)).toThrow(UndrawableBoardError);
    const notANumber: EventStormingBoard = {
      ...sample,
      elements: [
        { id: 'event_nan', elementType: 'event', label: 'NaN', position: { x: 0, y: NaN } },
      ],
    };
    expect(() => assertDrawable(notANumber)).toThrow('Element event_nan: position.y NaN lies');
    expect(() => assertDrawable(sample)).not.toThrow();
  });

  // The exporter validates what the canvas holds; its float arithmetic can land a hair beyond.
  it('validateBoard leaves the range to loadBoard', () => {
    expect(() => validateBoard(event({ x: beyond, y: 0 }))).not.toThrow();
  });
});

describe('Note alignment', () => {
  const withAlign = (align: unknown) => ({
    ...sample,
    elements: [
      ...sample.elements,
      { id: 'note_1', elementType: 'note', label: 'Kickoff', position: { x: 80, y: 80 }, align },
    ],
  });

  it('accepts both axes and round-trips them through the JSON serialization', () => {
    const board = loadBoard(withAlign({ horizontal: 'center', vertical: 'middle' }));
    const note = board.elements.find((el) => el.id === 'note_1');
    expect(note).toMatchObject({ align: { horizontal: 'center', vertical: 'middle' } });
    const out = serializeBoard(board);
    expect(out).toContain('"horizontal": "center"');
    expect(out).toContain('"vertical": "middle"');
    expect(serializeBoard(parseBoardJSON(out))).toBe(out);
  });

  it('accepts a single axis (the absent axis means the default left/top)', () => {
    const note = loadBoard(withAlign({ vertical: 'bottom' })).elements.find(
      (el) => el.id === 'note_1',
    );
    expect(note).toMatchObject({ align: { vertical: 'bottom' } });
    if (note?.elementType === 'note') expect(note.align?.horizontal).toBeUndefined();
  });

  it('rejects an unknown horizontal value', () => {
    expect(() => loadBoard(withAlign({ horizontal: 'justify' }))).toThrow();
  });

  it('rejects a horizontal word on the vertical axis', () => {
    expect(() => loadBoard(withAlign({ vertical: 'center' }))).toThrow();
  });

  it('rejects a non-object align', () => {
    expect(() => loadBoard(withAlign('center'))).toThrow();
  });
});

describe('Attachments (pinning)', () => {
  it('pins the exact attachable and host kind sets', () => {
    expect(ATTACHABLE_STICKY_KINDS).toEqual(['actor', 'hotspot', 'note']);
    expect(HOST_STICKY_KINDS).toEqual([
      'event',
      'command',
      'aggregate',
      'policy',
      'readmodel',
      'external',
    ]);
  });

  it('accepts an actor and a hotspot attached to host stickies (position stays absolute)', () => {
    const board = {
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'actor_customer',
          elementType: 'actor',
          label: 'Customer',
          position: { x: 250, y: 280 },
          attachedTo: 'cmd_place_order',
        },
        {
          id: 'hot_retry',
          elementType: 'hotspot',
          label: 'Retry?',
          position: { x: 640, y: 280 },
          attachedTo: 'event_order_placed',
        },
      ],
    };
    const loaded = loadBoard(board);
    const actor = loaded.elements.find((el) => el.id === 'actor_customer');
    const hotspot = loaded.elements.find((el) => el.id === 'hot_retry');
    expect(actor).toMatchObject({ attachedTo: 'cmd_place_order', position: { x: 250, y: 280 } });
    expect(hotspot).toMatchObject({ attachedTo: 'event_order_placed' });
  });

  it('accepts a note attached to a host sticky (position stays absolute)', () => {
    const board = {
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'note_check',
          elementType: 'note',
          label: 'Check with legal',
          position: { x: 640, y: 260 },
          attachedTo: 'event_order_placed',
        },
      ],
    };
    const note = loadBoard(board).elements.find((el) => el.id === 'note_check');
    expect(note).toMatchObject({
      attachedTo: 'event_order_placed',
      position: { x: 640, y: 260 },
    });
  });

  it('rejects attachedTo referencing a missing element', () => {
    const bad = {
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'actor_ghosted',
          elementType: 'actor',
          label: 'Ghosted',
          position: { x: 0, y: 0 },
          attachedTo: 'ghost',
        },
      ],
    };
    expect(() => loadBoard(bad)).toThrow(/attachedTo "ghost" references no element/);
  });

  it('rejects attaching to a non-host kind (no attach chains)', () => {
    const bad = {
      ...sample,
      elements: [
        ...sample.elements,
        { id: 'actor_host', elementType: 'actor', label: 'Host?', position: { x: 0, y: 0 } },
        {
          id: 'hot_chained',
          elementType: 'hotspot',
          label: 'Chained',
          position: { x: 10, y: 10 },
          attachedTo: 'actor_host',
        },
      ],
    };
    expect(() => loadBoard(bad)).toThrow(/may only attach to host stickies/);
  });

  it('rejects attaching to a note (annotations are never hosts)', () => {
    const bad = {
      ...sample,
      elements: [
        ...sample.elements,
        { id: 'note_1', elementType: 'note', label: 'A note', position: { x: 0, y: 0 } },
        {
          id: 'actor_on_note',
          elementType: 'actor',
          label: 'On note',
          position: { x: 10, y: 10 },
          attachedTo: 'note_1',
        },
      ],
    };
    expect(() => loadBoard(bad)).toThrow(/may only attach to host stickies/);
  });

  it('rejects a note attachedTo referencing a missing element', () => {
    const bad = {
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'note_ghosted',
          elementType: 'note',
          label: 'Ghosted',
          position: { x: 0, y: 0 },
          attachedTo: 'ghost',
        },
      ],
    };
    expect(() => loadBoard(bad)).toThrow(/attachedTo "ghost" references no element/);
  });

  it('rejects a note attached to another note (notes are never hosts)', () => {
    const bad = {
      ...sample,
      elements: [
        ...sample.elements,
        { id: 'note_host', elementType: 'note', label: 'Host?', position: { x: 0, y: 0 } },
        {
          id: 'note_chained',
          elementType: 'note',
          label: 'Chained',
          position: { x: 10, y: 10 },
          attachedTo: 'note_host',
        },
      ],
    };
    expect(() => loadBoard(bad)).toThrow(/may only attach to host stickies/);
  });

  it('round-trips a manually sized attached note through the JSON serialization', () => {
    const board = loadBoard({
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'note_check',
          elementType: 'note',
          label: 'Check with legal',
          position: { x: 640, y: 260 },
          size: { width: 240, height: 160 },
          attachedTo: 'event_order_placed',
        },
      ],
    });
    const out = serializeBoard(board);
    expect(out).toContain('"attachedTo": "event_order_placed"');
    expect(out).toContain('"width": 240');
    expect(serializeBoard(parseBoardJSON(out))).toBe(out);
  });

  it('round-trips attachedTo through the deterministic JSON serialization', () => {
    const board = loadBoard({
      ...sample,
      elements: [
        ...sample.elements,
        {
          id: 'actor_customer',
          elementType: 'actor',
          label: 'Customer',
          position: { x: 250, y: 280 },
          attachedTo: 'cmd_place_order',
        },
      ],
    });
    const out = serializeBoard(board);
    expect(out).toContain('"attachedTo": "cmd_place_order"');
    expect(serializeBoard(parseBoardJSON(out))).toBe(out);
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
