import { describe, it, expect } from 'vitest';
import { parseDSL, parseDSLWithDiagnostics, serializeDSL } from '../src/index.js';

/** Canonical example board (spec §7) — kept verbatim in webapp/vscode/e2e. */
const ORDER_CHECKOUT = `title Order Checkout

actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [420, 290] (id agg_order)
event Order Placed [620, 300]
policy When order placed, ship it [800, 300]
command Ship Order [980, 300]
aggregate Order [1160, 290] (id agg_order_2)
event Order Shipped [1340, 300]
readmodel Order Status [620, 120]
external Payment Provider [420, 520]
hotspot Double payment on retry? [620, 520]
note Big-picture session: checkout flow [80, 80]

Customer -> Place Order
Place Order -> #agg_order
Place Order -> Payment Provider
#agg_order -> Order Placed
Order Placed -> Order Status
Order Placed -> When order placed, ship it
When order placed, ship it -> Ship Order
Ship Order -> #agg_order_2
#agg_order_2 -> Order Shipped`;

const ALL_KINDS = `title Every Kind
event Order Placed [620, 300]
command Place Order [240, 300]
actor Customer [80, 300]
aggregate Order [420, 290]
policy When order placed, ship it [800, 300]
readmodel Order Status [620, 120]
external Payment Provider [420, 520]
hotspot Double payment on retry? [620, 520]
note Big-picture session [80, 80]
line [[100, 100], [200, 150], [180, 240]] (dashed)`;

describe('parseDSL', () => {
  it('parses the Order Checkout board (stickies, arrows, coordinate convention)', () => {
    const board = parseDSL(ORDER_CHECKOUT);
    expect(board.config.title).toBe('Order Checkout');
    const placed = board.elements.find((e) => e.label === 'Order Placed');
    expect(placed?.elementType).toBe('event');
    // [x, y] -> x FIRST: x=620, y=300 (board pixels)
    expect(placed?.position).toEqual({ x: 620, y: 300 });
    expect(board.edges).toHaveLength(9);
    expect(board.edges.every((e) => e.edgeType === 'arrow')).toBe(true);
  });

  it('allocates slug-based ids with per-kind prefixes', () => {
    const board = parseDSL(ORDER_CHECKOUT);
    const idOf = (label: string) => board.elements.find((e) => e.label === label)?.id;
    expect(idOf('Customer')).toBe('actor_customer');
    expect(idOf('Place Order')).toBe('cmd_place_order');
    expect(idOf('Order')).toBe('agg_order');
    expect(idOf('Order Placed')).toBe('event_order_placed');
    expect(idOf('When order placed, ship it')).toBe('policy_when_order_placed_ship_it');
    expect(idOf('Order Status')).toBe('read_order_status');
    expect(idOf('Payment Provider')).toBe('ext_payment_provider');
    expect(idOf('Double payment on retry?')).toBe('hot_double_payment_on_retry');
    expect(board.elements.some((e) => e.id.startsWith('note_'))).toBe(true);
    expect(board.edges[0]!.id).toBe('arrow_1');
  });

  it('defaults missing coordinates to [0, 0]', () => {
    const board = parseDSL('title T\nevent Order Placed');
    expect(board.elements[0]!.position).toEqual({ x: 0, y: 0 });
    const once = serializeDSL(board);
    expect(once).toContain('event Order Placed [0, 0]');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('preserves unknown lines in rawPassthrough', () => {
    const board = parseDSL('title T\nsomeFutureKeyword foo bar\nevent X [100, 200]');
    expect(board.rawPassthrough).toContain('someFutureKeyword foo bar');
  });
});

describe('parseDSL – all element kinds', () => {
  it('reads every sticky kind plus note and drawing with its elementType', () => {
    const board = parseDSL(ALL_KINDS);
    const types = board.elements.map((e) => e.elementType);
    expect(types).toEqual([
      'event',
      'command',
      'actor',
      'aggregate',
      'policy',
      'readmodel',
      'external',
      'hotspot',
      'note',
      'drawing',
    ]);
    const drawing = board.elements.find((e) => e.elementType === 'drawing');
    expect(drawing?.id).toBe('draw_line');
    if (drawing?.elementType === 'drawing') {
      expect(drawing.points).toEqual([
        { x: 100, y: 100 },
        { x: 200, y: 150 },
        { x: 180, y: 240 },
      ]);
      expect(drawing.strokeStyle).toBe('dashed');
    }
  });
});

describe('parseDSL – arrows', () => {
  const base = 'title T\nevent A [800, 300]\ncommand B [500, 600]\n';

  it('arrow with ; annotation', () => {
    const board = parseDSL(base + 'A -> B; async');
    const arrow = board.edges[0];
    expect(arrow?.label).toBe('async');
    const out = serializeDSL(board);
    expect(out).toContain('A -> B; async');
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('an arrow between stickies with keyword-prefix names ("Command") is preserved', () => {
    // Default name "Command" starts with the keyword `command`; the arrow line must NOT be
    // misread as a declaration (otherwise the arrow disappears on reload).
    const src =
      'title T\ncommand Command [800, 300]\ncommand Command 2 [500, 600]\nCommand -> Command 2';
    const board = parseDSL(src);
    expect(board.elements.filter((e) => e.elementType === 'command')).toHaveLength(2);
    expect(board.edges).toHaveLength(1);
    expect(board.edges[0]!.from).not.toBe(board.edges[0]!.to);
    const out = serializeDSL(board);
    expect(parseDSL(out).edges).toHaveLength(1); // arrow survives the re-parse
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('duplicate sticky labels do not lose an arrow (the serializer switches to ids)', () => {
    const board = parseDSL(base + 'A -> B');
    // Set both stickies to the same name (as after a colliding rename) — labels stay verbatim,
    // the ambiguity is carried by `(id …)` suffixes and `#id` references instead of renaming.
    const dup = { ...board, elements: board.elements.map((e) => ({ ...e, label: 'X' })) };
    const out = serializeDSL(dup);
    expect(out).toContain('event X [800, 300] (id event_a)');
    expect(out).toContain('command X [500, 600] (id cmd_b)');
    expect(out).toContain('#event_a -> #cmd_b');
    // Re-import: BOTH stickies keep the label and the arrow connects two different stickies.
    const round = parseDSL(out);
    expect(round.elements.map((e) => e.label)).toEqual(['X', 'X']);
    expect(round.edges).toHaveLength(1);
    expect(round.edges[0]!.from).not.toBe(round.edges[0]!.to);
    expect(serializeDSL(round)).toBe(out);
  });

  it('empty labels fall back to the per-kind default name', () => {
    const board = parseDSL(base + 'A -> B');
    const blank = { ...board, elements: board.elements.map((e) => ({ ...e, label: '' })) };
    const out = serializeDSL(blank);
    expect(out).toContain('event Domain Event [800, 300]');
    expect(out).toContain('command Command [500, 600]');
    expect(out).toContain('Domain Event -> Command');
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('an arrow label containing a numeric tuple does not defeat arrow pre-detection', () => {
    const src =
      'title T\ncommand Command [800, 300]\naggregate Order [500, 600]\nCommand -> Order; retry [3, 5]';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements).toHaveLength(2);
    expect(board.edges).toHaveLength(1);
    expect(board.edges[0]!.label).toBe('retry [3, 5]');
    const out = serializeDSL(board);
    expect(parseDSL(out).edges).toHaveLength(1);
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('escapes real line breaks in sticky labels (multi-line labels survive the round-trip)', () => {
    const board = parseDSL(base + 'A -> B');
    const renamed = {
      ...board,
      elements: board.elements.map((e) => (e.label === 'A' ? { ...e, label: 'Order\nPlaced' } : e)),
    };
    const out = serializeDSL(renamed);
    expect(out).toContain('event Order\\nPlaced [800, 300]');
    expect(out).toContain('Order\\nPlaced -> B');
    const round = parseDSL(out);
    const placed = round.elements.find((e) => e.elementType === 'event');
    expect(placed?.label).toBe('Order\nPlaced');
    expect(placed?.position).toEqual({ x: 800, y: 300 });
    expect(round.edges).toHaveLength(1);
    expect(serializeDSL(round)).toBe(out);
  });

  it('defuses `//` in sticky labels (nothing is comment-stripped on re-import)', () => {
    const board = parseDSL(base + 'A -> B');
    const renamed = {
      ...board,
      elements: board.elements.map((e) =>
        e.label === 'A' ? { ...e, label: 'Save //TODO check' } : e,
      ),
    };
    const out = serializeDSL(renamed);
    const { board: round, diagnostics } = parseDSLWithDiagnostics(out);
    expect(diagnostics).toHaveLength(0);
    const saved = round.elements.find((e) => e.elementType === 'event');
    expect(saved?.label).toBe('Save ∕∕TODO check');
    expect(saved?.position).toEqual({ x: 800, y: 300 });
    expect(round.edges).toHaveLength(1);
    expect(serializeDSL(round)).toBe(out);
  });

  it('sanitizes `->` in sticky labels to `→` (names stay arrow-safe)', () => {
    const board = parseDSL(base + 'A -> B');
    const renamed = {
      ...board,
      elements: board.elements.map((e) => (e.label === 'A' ? { ...e, label: 'go -> there' } : e)),
    };
    const out = serializeDSL(renamed);
    expect(out).toContain('event go → there [800, 300]');
    expect(out).toContain('go → there -> B');
    expect(parseDSL(out).edges).toHaveLength(1);
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });
});

describe('parseDSL – comments', () => {
  it('does NOT parse commented-out stickies as elements', () => {
    const board = parseDSL('title T\n// event Ghost [500, 500]\nevent Real [400, 400]');
    expect(board.elements.map((e) => e.label)).toEqual(['Real']);
    expect(board.rawPassthrough).toContain('// event Ghost [500, 500]');
  });

  it('separates trailing // comments from content (label stays clean)', () => {
    const board = parseDSL('title T\nevent Order Placed [620, 300] // double-check');
    const placed = board.elements[0]!;
    expect(placed.label).toBe('Order Placed');
    expect(board.rawPassthrough).toContain('// double-check');
  });

  it('skips /* ... */ blocks spanning multiple lines', () => {
    const board = parseDSL(
      'title T\n/* everything\nevent Ghost [500, 500]\ngone */\nevent Real [400, 400]',
    );
    expect(board.elements.map((e) => e.label)).toEqual(['Real']);
  });

  it('leaves // after a URL scheme separator untouched', () => {
    const board = parseDSL('title T\nnote see https://example.org/docs [80, 80]');
    expect(board.elements[0]!.label).toBe('see https://example.org/docs');
  });

  it('leaves // inside quotes untouched (arrow annotations)', () => {
    const board = parseDSL(
      "title T\nevent A [800, 300]\ncommand B [500, 600]\nA -> B; read '//notes' first",
    );
    expect(board.edges[0]!.label).toBe("read '//notes' first");
  });

  it('comments survive the round-trip (rawPassthrough)', () => {
    const src = 'title T\n// important note\nevent Real [400, 400]';
    const once = serializeDSL(parseDSL(src));
    expect(once).toContain('// important note');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('keeps `//` after a URL scheme separator intact when serializing note text', () => {
    const once = serializeDSL(parseDSL('title T\nnote see https://example.org/docs [80, 80]'));
    expect(once).toContain('note see https://example.org/docs [80, 80]');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('parseDSL – sticky names starting with config keywords', () => {
  it('preserves arrows from a sticky named "Line Manager"', () => {
    const src =
      'title T\nactor Line Manager [80, 300]\ncommand Approve Request [240, 300]\nLine Manager -> Approve Request';
    const board = parseDSL(src);
    expect(board.edges).toHaveLength(1);
    const out = serializeDSL(board);
    expect(parseDSL(out).edges).toHaveLength(1);
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('preserves arrows from a sticky named "Style Guide"', () => {
    const src = 'title T\nreadmodel Style Guide [80, 300]\ncommand B [240, 300]\nStyle Guide -> B';
    const board = parseDSL(src);
    expect(board.config.style).toBeUndefined();
    expect(board.edges).toHaveLength(1);
    const out = serializeDSL(board);
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('preserves arrows from a sticky named "Level Editor" while `level` config still parses', () => {
    const src =
      'title T\nlevel big-picture\nreadmodel Level Editor [80, 300]\ncommand B [240, 300]\nLevel Editor -> B';
    const board = parseDSL(src);
    expect(board.config.level).toBe('big-picture');
    expect(board.edges).toHaveLength(1);
    const out = serializeDSL(board);
    expect(parseDSL(out).edges).toHaveLength(1);
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('an arrow from a sticky named "Title Page" does NOT overwrite the board title', () => {
    const src = 'title Checkout\nevent Title Page [80, 300]\ncommand B [240, 300]\nTitle Page -> B';
    const board = parseDSL(src);
    expect(board.config.title).toBe('Checkout');
    expect(board.edges).toHaveLength(1);
    const out = serializeDSL(board);
    expect(parseDSL(out).config.title).toBe('Checkout');
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('a hand-written title containing `->` still parses as the title', () => {
    const board = parseDSL('title Order -> Cash');
    expect(board.config.title).toBe('Order -> Cash');
    expect(board.edges).toHaveLength(0);
  });
});

describe('parseDSL – names with parentheses', () => {
  it('leaves parentheses in names untouched (color only after coordinates)', () => {
    const board = parseDSL('title T\nevent Payment (retry) [620, 300]');
    const el = board.elements[0]!;
    expect(el.label).toBe('Payment (retry)');
    expect(el.color).toBeUndefined();
  });

  it('still reads the color after the coordinates', () => {
    const board = parseDSL('title T\nevent X [100, 200] (color #ff0000)');
    expect(board.elements[0]!.color).toBe('#ff0000');
  });
});

describe('parseDSL – style config', () => {
  it('reads style classic|dark', () => {
    const board = parseDSL('title T\nstyle dark');
    expect(board.config.style).toBe('dark');
    const once = serializeDSL(board);
    expect(once).toContain('style dark');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('keeps an unknown style losslessly in rawPassthrough', () => {
    const board = parseDSL('title T\nstyle neon');
    expect(board.config.style).toBeUndefined();
    expect(board.rawPassthrough).toContain('style neon');
  });

  it('an unparsable style line is not emitted twice when config.style is set', () => {
    // Unknown style -> lands in rawPassthrough, config.style stays undefined.
    const board = parseDSL('title T\nstyle neon');
    // Now the editor sets a valid style: the stale line must NOT survive as a duplicate.
    const withStyle = { ...board, config: { ...board.config, style: 'classic' as const } };
    const out = serializeDSL(withStyle);
    expect(out.match(/^style /gm)).toHaveLength(1);
    expect(out).toContain('style classic');
  });
});

describe('parseDSL – level config', () => {
  it('reads level big-picture|process|design', () => {
    for (const level of ['big-picture', 'process', 'design'] as const) {
      const board = parseDSL(`title T\nlevel ${level}`);
      expect(board.config.level).toBe(level);
      const once = serializeDSL(board);
      expect(once).toContain(`level ${level}`);
      expect(serializeDSL(parseDSL(once))).toBe(once);
    }
  });

  it('serializes config statements in the order title, style, level', () => {
    const once = serializeDSL(parseDSL('title T\nlevel process\nstyle dark\nevent A [100, 200]'));
    expect(once.split('\n').slice(0, 4)).toEqual([
      'title T',
      'style dark',
      'level process',
      'event A [100, 200]',
    ]);
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('keeps an unknown level losslessly in rawPassthrough with a line-numbered diagnostic', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics('title T\nlevel strategic\n');
    expect(board.config.level).toBeUndefined();
    expect(board.rawPassthrough).toContain('level strategic');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(2);
    expect(diagnostics[0]!.text).toContain('level strategic');
  });

  it('an unparsable level line is not emitted twice when config.level is set', () => {
    // Unknown level -> lands in rawPassthrough, config.level stays undefined.
    const board = parseDSL('title T\nlevel strategic');
    // Now the editor sets a valid level: the stale line must NOT survive as a duplicate.
    const withLevel = { ...board, config: { ...board.config, level: 'big-picture' as const } };
    const out = serializeDSL(withLevel);
    expect(out.match(/^level /gm)).toHaveLength(1);
    expect(out).toContain('level big-picture');
  });
});

describe('parseDSLWithDiagnostics', () => {
  it('reports unparsable lines with line numbers', () => {
    const { diagnostics } = parseDSLWithDiagnostics('title T\nevent broken [oops]\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(2);
    expect(diagnostics[0]!.text).toContain('event broken');
  });

  it('keeps a line with malformed coordinates losslessly in rawPassthrough', () => {
    const { board } = parseDSLWithDiagnostics('title T\nevent broken [oops]');
    expect(board.elements).toHaveLength(0);
    expect(board.rawPassthrough).toContain('event broken [oops]');
  });

  it('accepts unbounded pixel coordinates (negative, large) without clamping', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics('title T\nevent X [-500, 1400.5]');
    expect(board.elements[0]!.position).toEqual({ x: -500, y: 1400.5 });
    expect(diagnostics).toHaveLength(0);
  });

  it('reports unresolved arrow references with line numbers', () => {
    const { diagnostics } = parseDSLWithDiagnostics('title T\nevent A [500, 500]\nA -> Ghost');
    expect(diagnostics.some((d) => d.line === 3 && d.message.includes('Ghost'))).toBe(true);
  });

  it('comments produce NO diagnostics', () => {
    const { diagnostics } = parseDSLWithDiagnostics('title T\n// just a comment\n');
    expect(diagnostics).toHaveLength(0);
  });
});

describe('serializeDSL round-trip', () => {
  it('is stable for the full kind set (stickies/note/drawing)', () => {
    const once = serializeDSL(parseDSL(ALL_KINDS));
    const twice = serializeDSL(parseDSL(once));
    expect(twice).toBe(once);
  });

  it('is stable across two cycles (incl. spaces and punctuation in names)', () => {
    const once = serializeDSL(parseDSL(ORDER_CHECKOUT));
    const twice = serializeDSL(parseDSL(once));
    expect(twice).toBe(once);
  });

  it('the canonical Order Checkout example survives with 12 elements and 9 arrows', () => {
    const board = parseDSL(ORDER_CHECKOUT);
    expect(board.elements).toHaveLength(12);
    expect(board.edges).toHaveLength(9);
    // Fixed point after ONE canonicalization: parse -> serialize -> parse.
    const once = serializeDSL(board);
    const reparsed = parseDSL(once);
    expect(reparsed.elements).toHaveLength(12);
    expect(reparsed.edges).toHaveLength(9);
    expect(reparsed.elements.map((e) => e.label)).toEqual(board.elements.map((e) => e.label));
    expect(serializeDSL(reparsed)).toBe(once);
  });

  it('is stable for the canonical example with a level statement added', () => {
    const once = serializeDSL(parseDSL(ORDER_CHECKOUT + '\nlevel process'));
    expect(once.split('\n')[1]).toBe('level process');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('rounds coordinates to 3 decimals deterministically', () => {
    const board = parseDSL('title T\nevent X [100.00049, 200.0006]');
    const once = serializeDSL(board);
    expect(once).toContain('event X [100, 200.001]');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('notes – color & multiline', () => {
  it('parses color `(color …)` and a literal `\\n` as a real line break', () => {
    const src =
      'title T\nnote Looks good [800, 300] (color #15803d)\nnote Line1\\nLine2 [400, 600]';
    const notes = parseDSL(src).elements.filter((e) => e.elementType === 'note') as Array<{
      label: string;
      color?: string;
    }>;
    expect(notes).toHaveLength(2);
    expect(notes[0]!.color).toBe('#15803d');
    expect(notes[0]!.label).toBe('Looks good');
    expect(notes[1]!.color).toBeUndefined();
    expect(notes[1]!.label).toBe('Line1\nLine2');
  });

  it('round-trip is stable (color stays, line break stays escaped)', () => {
    const src = 'title T\nnote Risk here [800, 300] (color #b91c1c)\nnote A\\nB [400, 600]';
    const once = serializeDSL(parseDSL(src));
    expect(once).toContain('note Risk here [800, 300] (color #b91c1c)');
    expect(once).toContain('note A\\nB [400, 600]');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('note color (project extension: `(color …)`)', () => {
  it('parses the color and keeps the text clean', () => {
    const board = parseDSL('title T\nnote Looks good [800, 600] (color #15803d)');
    const note = board.elements.find((e) => e.elementType === 'note');
    expect(note).toMatchObject({ label: 'Looks good', color: '#15803d' });
  });

  it('also accepts CSS color names', () => {
    const board = parseDSL('title T\nnote Risk here [300, 200] (color red)');
    const note = board.elements.find((e) => e.elementType === 'note');
    expect(note).toMatchObject({ label: 'Risk here', color: 'red' });
  });

  it('serializes the color and is round-trip stable', () => {
    const src = 'title T\nnote Watch this [500, 500] (color #b45309)';
    const once = serializeDSL(parseDSL(src));
    expect(once).toContain('note Watch this [500, 500] (color #b45309)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('notes without a color stay unchanged (no empty parentheses)', () => {
    const out = serializeDSL(parseDSL('title T\nnote Plain [500, 500]'));
    expect(out).toContain('note Plain [500, 500]');
    expect(out).not.toContain('(color');
  });

  it('keeps `(color …)` inside the note text (color is only read after the coordinates)', () => {
    const board = parseDSL('title T\nnote use (color red) for risks [80, 80]');
    const note = board.elements.find((e) => e.elementType === 'note');
    expect(note?.label).toBe('use (color red) for risks');
    expect(note?.color).toBeUndefined();
    const once = serializeDSL(board);
    expect(once).toContain('note use (color red) for risks [80, 80]');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('attachments (project extension: `(on …)`)', () => {
  it('parses and round-trips an attached actor and hotspot', () => {
    const src = `title T
command Place Order [240, 300]
event Order Placed [620, 300]
actor Customer [250, 280] (on Place Order)
hotspot Double payment? [640, 280] (on Order Placed)`;
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    const actor = board.elements.find((e) => e.elementType === 'actor');
    const hotspot = board.elements.find((e) => e.elementType === 'hotspot');
    // attachedTo adds behavior only — the position stays the sticky's own absolute center.
    expect(actor).toMatchObject({ attachedTo: 'cmd_place_order', position: { x: 250, y: 280 } });
    expect(hotspot).toMatchObject({ attachedTo: 'event_order_placed' });
    const once = serializeDSL(board);
    expect(once).toContain('actor Customer [250, 280] (on Place Order)');
    expect(once).toContain('hotspot Double payment? [640, 280] (on Order Placed)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('resolves a host declared AFTER the attacher (deferred like arrow endpoints)', () => {
    const src =
      'title T\nactor Customer [250, 280] (on Place Order)\ncommand Place Order [240, 300]';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'actor')).toMatchObject({
      attachedTo: 'cmd_place_order',
    });
  });

  it('reads a host name containing parentheses up to the final `)` of the line', () => {
    const src =
      'title T\nevent Payment (retry) [620, 300]\nhotspot Why twice? [640, 280] (on Payment (retry))';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'hotspot')).toMatchObject({
      attachedTo: 'event_payment_retry',
    });
    const once = serializeDSL(board);
    expect(once).toContain('hotspot Why twice? [640, 280] (on Payment (retry))');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('keeps `->` in host labels arrow-safe (`→` in name AND `(on …)` reference)', () => {
    const board = parseDSL('title T\ncommand Ship [240, 300]\nactor Clerk [250, 280] (on Ship)');
    const renamed = {
      ...board,
      elements: board.elements.map((e) =>
        e.elementType === 'command' ? { ...e, label: 'go -> there' } : e,
      ),
    };
    const out = serializeDSL(renamed);
    expect(out).toContain('command go → there [240, 300]');
    expect(out).toContain('actor Clerk [250, 280] (on go → there)');
    const round = parseDSL(out);
    const host = round.elements.find((e) => e.elementType === 'command');
    expect(round.elements.find((e) => e.elementType === 'actor')).toMatchObject({
      attachedTo: host!.id,
    });
    expect(serializeDSL(round)).toBe(out);
  });

  it('combines color and attachment — canonical suffix order is `(color …) (on …)`', () => {
    const src =
      'title T\ncommand Place Order [240, 300]\nactor Customer [250, 280] (color #6d28d9) (on Place Order)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'actor')).toMatchObject({
      color: '#6d28d9',
      attachedTo: 'cmd_place_order',
    });
    const once = serializeDSL(board);
    expect(once).toContain('actor Customer [250, 280] (color #6d28d9) (on Place Order)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('does not steal a `(color …)` inside the host name as a color override', () => {
    const src =
      'title T\nevent Pay (color red) now [620, 300]\nhotspot H [640, 280] (on Pay (color red) now)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    const hotspot = board.elements.find((e) => e.elementType === 'hotspot');
    expect(hotspot).toMatchObject({ attachedTo: 'event_pay_color_red_now' });
    expect(hotspot?.color).toBeUndefined();
    const once = serializeDSL(board);
    expect(once).toContain('hotspot H [640, 280] (on Pay (color red) now)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('unresolved host: line-numbered diagnostic, sticky stays unpinned, round-trip fixed point', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nactor Customer [250, 280] (on Ghost)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(2);
    expect(diagnostics[0]!.message).toContain('Ghost');
    expect(diagnostics[0]!.text).toContain('actor Customer');
    const actor = board.elements.find((e) => e.elementType === 'actor');
    expect(actor?.label).toBe('Customer');
    expect(actor).not.toHaveProperty('attachedTo');
    const once = serializeDSL(board);
    expect(once).toContain('actor Customer [250, 280]');
    expect(once).not.toContain('(on');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('a host of a non-host kind yields a diagnostic and no attachment (no chains)', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nactor A [0, 0]\nhotspot H [10, 10] (on A)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(3);
    expect(diagnostics[0]!.message).toContain('may only attach to host stickies');
    expect(board.elements.find((e) => e.elementType === 'hotspot')).not.toHaveProperty(
      'attachedTo',
    );
  });

  it('`(on …)` on a non-attachable kind yields a diagnostic and is ignored', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nevent A [0, 0]\nevent B [10, 10] (on A)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(3);
    expect(diagnostics[0]!.message).toContain('only actor/hotspot');
    const once = serializeDSL(board);
    expect(once).toContain('event B [10, 10]');
    expect(once).not.toContain('(on');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('note attachments (project extension: `(on …)` on note lines)', () => {
  it('parses and round-trips an attached note (position stays absolute)', () => {
    const src =
      'title T\nevent Order Placed [620, 300]\nnote Check with legal [640, 260] (on Order Placed)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    const note = board.elements.find((e) => e.elementType === 'note');
    expect(note).toMatchObject({
      label: 'Check with legal',
      attachedTo: 'event_order_placed',
      position: { x: 640, y: 260 },
    });
    const once = serializeDSL(board);
    expect(once).toContain('note Check with legal [640, 260] (on Order Placed)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('resolves a host declared AFTER the note (deferred like arrow endpoints)', () => {
    const src = 'title T\nnote Check [640, 260] (on Order Placed)\nevent Order Placed [620, 300]';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'note')).toMatchObject({
      attachedTo: 'event_order_placed',
    });
  });

  it('combines color and attachment — canonical suffix order is `(color …) (on …)`', () => {
    const src =
      'title T\ncommand Place Order [240, 300]\nnote Watch this [250, 240] (color #b45309) (on Place Order)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'note')).toMatchObject({
      color: '#b45309',
      attachedTo: 'cmd_place_order',
    });
    const once = serializeDSL(board);
    expect(once).toContain('note Watch this [250, 240] (color #b45309) (on Place Order)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('combines size and attachment — canonical suffix order is `(size …) (on …)`', () => {
    const src =
      'title T\ncommand Place Order [240, 300]\nnote Agenda [250, 240] (size 240x160) (on Place Order)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'note')).toMatchObject({
      size: { width: 240, height: 160 },
      attachedTo: 'cmd_place_order',
    });
    const once = serializeDSL(board);
    expect(once).toContain('note Agenda [250, 240] (size 240x160) (on Place Order)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('canonicalizes all three suffixes to `(color …) (size …) (on …)` — on stays last', () => {
    const src =
      'title T\nevent Order Placed [620, 300]\nnote Kickoff [640, 260] (size 240x160) (color #15803d) (on Order Placed)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'note')).toMatchObject({
      label: 'Kickoff',
      color: '#15803d',
      size: { width: 240, height: 160 },
      attachedTo: 'event_order_placed',
    });
    const once = serializeDSL(board);
    expect(once).toContain(
      'note Kickoff [640, 260] (color #15803d) (size 240x160) (on Order Placed)',
    );
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('`(on #id)` pins a note onto a duplicate-label host and round-trips as an id reference', () => {
    const src = `title T
command Approve [240, 300]
command Approve [980, 420]
note Needs sign-off [990, 360] (on #cmd_approve_2)`;
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'note')).toMatchObject({
      attachedTo: 'cmd_approve_2',
    });
    const once = serializeDSL(board);
    expect(once).toContain('note Needs sign-off [990, 360] (on #cmd_approve_2)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('unresolved host: line-numbered diagnostic, note stays unpinned, round-trip fixed point', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nnote Orphan [80, 80] (on Ghost)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(2);
    expect(diagnostics[0]!.message).toContain('Ghost');
    expect(diagnostics[0]!.text).toContain('note Orphan');
    const note = board.elements.find((e) => e.elementType === 'note');
    expect(note?.label).toBe('Orphan');
    expect(note).not.toHaveProperty('attachedTo');
    const once = serializeDSL(board);
    expect(once).toContain('note Orphan [80, 80]');
    expect(once).not.toContain('(on');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('reads a host name containing parentheses up to the final `)` of the line', () => {
    const src =
      'title T\nevent Payment (retry) [620, 300]\nnote Why twice? [640, 260] (on Payment (retry))';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'note')).toMatchObject({
      attachedTo: 'event_payment_retry',
    });
    const once = serializeDSL(board);
    expect(once).toContain('note Why twice? [640, 260] (on Payment (retry))');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('a note host of a non-host kind yields a diagnostic and no attachment (no chains)', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nactor A [0, 0]\nnote N [10, 10] (on A)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(3);
    expect(diagnostics[0]!.message).toContain('may only attach to host stickies');
    expect(board.elements.find((e) => e.elementType === 'note')).not.toHaveProperty('attachedTo');
  });

  it('keeps `(on …)` inside the note text (attachment is only read after the coordinates)', () => {
    const src =
      'title T\nevent Order Placed [620, 300]\nnote drop it (on the host) later [80, 80]\nnote pinned [640, 260] (on Order Placed)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    const notes = board.elements.filter((e) => e.elementType === 'note');
    expect(notes[0]!.label).toBe('drop it (on the host) later');
    expect(notes[0]).not.toHaveProperty('attachedTo');
    expect(notes[1]).toMatchObject({ attachedTo: 'event_order_placed' });
    const once = serializeDSL(board);
    expect(once).toContain('note drop it (on the host) later [80, 80]');
    expect(once).toContain('note pinned [640, 260] (on Order Placed)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('`(on …)` on a drawing yields a diagnostic and is ignored', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nline [[100, 100], [200, 150]] (dashed) (on X)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(2);
    expect(diagnostics[0]!.message).toContain('only actor/hotspot/note');
    expect(board.elements.find((e) => e.elementType === 'drawing')).toBeDefined();
    const once = serializeDSL(board);
    expect(once).toContain('line [[100, 100], [200, 150]] (dashed)');
    expect(once).not.toContain('(on');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('duplicate labels (project extension: `(id …)` + `#id` references)', () => {
  it('parses and round-trips the spec example (two aggregates named "Order")', () => {
    const src = `title T
command Place Order [240, 300]
command Ship Order [980, 420]
aggregate Order [420, 290] (id agg_order)
aggregate Order [1160, 290] (id agg_order_2)
event Order Placed [620, 300]
event Order Shipped [1160, 420]

Place Order -> #agg_order
#agg_order -> Order Placed
Ship Order -> #agg_order_2
#agg_order_2 -> Order Shipped`;
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    const aggs = board.elements.filter((e) => e.elementType === 'aggregate');
    expect(aggs.map((a) => a.label)).toEqual(['Order', 'Order']);
    expect(aggs.map((a) => a.id)).toEqual(['agg_order', 'agg_order_2']);
    expect(board.edges.map((e) => `${e.from}>${e.to}`)).toEqual([
      'cmd_place_order>agg_order',
      'agg_order>event_order_placed',
      'cmd_ship_order>agg_order_2',
      'agg_order_2>event_order_shipped',
    ]);
    const once = serializeDSL(board);
    expect(once).toContain('aggregate Order [420, 290] (id agg_order)');
    expect(once).toContain('aggregate Order [1160, 290] (id agg_order_2)');
    expect(once).toContain('Place Order -> #agg_order');
    expect(once).toContain('#agg_order_2 -> Order Shipped');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('hand-written duplicates WITHOUT explicit ids get distinct auto ids and serialize with them', () => {
    const src = 'title T\naggregate Order [420, 290]\naggregate Order [1160, 290]';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.map((e) => e.id)).toEqual(['agg_order', 'agg_order_2']);
    const once = serializeDSL(board);
    expect(once).toContain('aggregate Order [420, 290] (id agg_order)');
    expect(once).toContain('aggregate Order [1160, 290] (id agg_order_2)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('resolves `#id` for an element that did not need an `(id …)` suffix', () => {
    const src =
      'title T\nevent Order Placed [620, 300]\ncommand X [0, 0]\nX -> #event_order_placed';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.edges[0]).toMatchObject({ from: 'cmd_x', to: 'event_order_placed' });
    // Unambiguous labels reference by NAME again — the id reference is normalized away.
    const once = serializeDSL(board);
    expect(once).toContain('X -> Order Placed');
    expect(once).not.toContain('(id');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('mixes label and id references on one board to a round-trip fixed point', () => {
    const src = `title T
aggregate Order [420, 290] (id agg_order)
aggregate Order [1160, 290] (id agg_order_2)
command Place Order [240, 300]
Place Order -> #agg_order
#agg_order_2 -> Place Order`;
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.edges).toHaveLength(2);
    const once = serializeDSL(board);
    expect(once).toContain('Place Order -> #agg_order');
    expect(once).toContain('#agg_order_2 -> Place Order');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('a label literally starting with `#` is declared with an id and referenced as `#id`', () => {
    const src = 'title T\nevent #123 escalated [620, 300]\ncommand B [0, 0]';
    const board = parseDSL(src);
    const withArrow = {
      ...board,
      edges: [
        { id: 'arrow_1', edgeType: 'arrow' as const, from: 'cmd_b', to: 'event_123_escalated' },
      ],
    };
    const out = serializeDSL(withArrow);
    // A `#…` arrow token always reads as an id — so the name is never used as a reference.
    expect(out).toContain('event #123 escalated [620, 300] (id event_123_escalated)');
    expect(out).toContain('B -> #event_123_escalated');
    const round = parseDSL(out);
    expect(round.elements.find((e) => e.elementType === 'event')?.label).toBe('#123 escalated');
    expect(round.edges[0]).toMatchObject({ from: 'cmd_b', to: 'event_123_escalated' });
    expect(serializeDSL(round)).toBe(out);
  });

  it('accepts an explicit-but-unneeded `(id …)` and drops it again on serialize (normalization)', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nevent Foo [0, 0] (id my_custom_id)',
    );
    expect(diagnostics).toHaveLength(0);
    expect(board.elements[0]!.id).toBe('my_custom_id');
    const once = serializeDSL(board);
    expect(once).toContain('event Foo [0, 0]\n');
    expect(once).not.toContain('(id');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('ambiguity is decided AFTER trim — labels differing only in whitespace share the name', () => {
    const board = parseDSL('title T\nevent A [800, 300]\ncommand B [500, 600]\nA -> B');
    const dup = {
      ...board,
      elements: board.elements.map((e) => ({ ...e, label: e.label === 'A' ? 'X' : ' X ' })),
    };
    const out = serializeDSL(dup);
    expect(out).toContain('event X [800, 300] (id event_a)');
    expect(out).toContain('command X [500, 600] (id cmd_b)');
    expect(out).toContain('#event_a -> #cmd_b');
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('two empty labels of one kind fall back to the SAME default name and get ids', () => {
    const board = parseDSL('title T\nevent A [800, 300]\nevent B [500, 600]');
    const blank = { ...board, elements: board.elements.map((e) => ({ ...e, label: '' })) };
    const out = serializeDSL(blank);
    expect(out).toContain('event Domain Event [800, 300] (id event_a)');
    expect(out).toContain('event Domain Event [500, 600] (id event_b)');
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('canonicalizes the sticky suffix order to `(color …) (id …) (on …)`', () => {
    const src = `title T
command Place Order [240, 300]
actor Customer [250, 280] (id actor_customer) (color #6d28d9) (on Place Order)
actor Customer [80, 300]`;
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    const once = serializeDSL(board);
    expect(once).toContain(
      'actor Customer [250, 280] (color #6d28d9) (id actor_customer) (on Place Order)',
    );
    expect(once).toContain('actor Customer [80, 300] (id actor_customer_2)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('`(on #id)` pins onto an ambiguous host and round-trips as an id reference', () => {
    const src = `title T
command Approve [240, 300]
command Approve [980, 420]
actor Manager [250, 280] (on #cmd_approve_2)`;
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'actor')).toMatchObject({
      attachedTo: 'cmd_approve_2',
    });
    const once = serializeDSL(board);
    expect(once).toContain('actor Manager [250, 280] (on #cmd_approve_2)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('malformed id: line-numbered diagnostic, suffix ignored, element gets an allocated id', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nevent A [0, 0] (id has space!)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(2);
    expect(diagnostics[0]!.message).toContain('(id has space!)');
    expect(diagnostics[0]!.text).toContain('event A');
    expect(board.elements[0]!.id).toBe('event_a');
    const once = serializeDSL(board);
    expect(once).toContain('event A [0, 0]');
    expect(once).not.toContain('(id');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('duplicate explicit id: diagnostic, the LATER element gets a fresh id (never throws)', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\naggregate Order [0, 0] (id agg_order)\naggregate Order [10, 10] (id agg_order)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(3);
    expect(diagnostics[0]!.message).toContain('agg_order');
    expect(board.elements.map((e) => e.id)).toEqual(['agg_order', 'agg_order_2']);
    const once = serializeDSL(board);
    expect(once).toContain('aggregate Order [0, 0] (id agg_order)');
    expect(once).toContain('aggregate Order [10, 10] (id agg_order_2)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('an explicit id colliding with an earlier auto id yields a diagnostic and a fresh id', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nevent A [0, 0]\ncommand B [10, 10] (id event_a)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(3);
    expect(board.elements.map((e) => e.id)).toEqual(['event_a', 'cmd_b']);
  });

  it('an explicit `(id arrow_1)` never collides with generated arrow ids', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nevent A [0, 0] (id arrow_1)\ncommand B [10, 10]\nA -> B',
    );
    expect(diagnostics).toHaveLength(0);
    expect(board.elements[0]!.id).toBe('arrow_1');
    expect(board.edges[0]!.id).toBe('arrow_2');
    const once = serializeDSL(board);
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('unresolved `#id` arrow endpoint: NO label fallback, established diagnostic, lossless', () => {
    // An element LABELED "#ghost" exists — but `#` always means id, so the token stays
    // unresolved (its id is event_ghost, not ghost).
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nevent A [0, 0]\nevent #ghost [10, 10]\nA -> #ghost',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(4);
    expect(diagnostics[0]!.message).toContain('"#ghost" not found');
    expect(board.edges).toHaveLength(0);
    expect(board.rawPassthrough).toContain('A -> #ghost');
    const once = serializeDSL(board);
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('unresolved `(on #id)` host: NO label fallback, diagnostic, sticky stays unpinned', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\ncommand #ghost [0, 0]\nactor Customer [250, 280] (on #ghost)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(3);
    expect(diagnostics[0]!.message).toContain('"#ghost" not found');
    expect(board.elements.find((e) => e.elementType === 'actor')).not.toHaveProperty('attachedTo');
  });

  it('a `#id` arrow endpoint hitting a note is dropped with a diagnostic (never throws)', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nevent A [0, 0]\nnote N [80, 80]\nA -> #note_n',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain('arrows may only connect stickies');
    expect(board.edges).toHaveLength(0);
    expect(board.rawPassthrough).toContain('A -> #note_n');
    const once = serializeDSL(board);
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('a `(on #id)` host hitting a note yields the host-kind diagnostic', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nnote N [80, 80]\nactor A [10, 10] (on #note_n)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain('may only attach to host stickies');
    expect(board.elements.find((e) => e.elementType === 'actor')).not.toHaveProperty('attachedTo');
  });

  it('`(id …)` on a note line yields a diagnostic; `(id …)` inside note text stays', () => {
    const src = 'title T\nnote use (id x) sparingly [80, 80]\nnote Kickoff [80, 200] (id note_1)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(3);
    expect(diagnostics[0]!.message).toContain('only sticky kinds support');
    const notes = board.elements.filter((e) => e.elementType === 'note');
    expect(notes[0]!.label).toBe('use (id x) sparingly');
    expect(notes[1]!.id).toBe('note_kickoff');
    const once = serializeDSL(board);
    expect(once).toContain('note use (id x) sparingly [80, 80]');
    expect(once).toContain('note Kickoff [80, 200]');
    expect(once).not.toContain('(id note_1)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('`(id …)` on a drawing yields a diagnostic and is ignored', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nline [[100, 100], [200, 150]] (dashed) (id d1)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain('only sticky kinds support');
    expect(board.elements[0]!.id).toBe('draw_line');
    const once = serializeDSL(board);
    expect(once).toContain('line [[100, 100], [200, 150]] (dashed)');
    expect(once).not.toContain('(id');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('substitutes ids outside the DSL charset on emit (JSON-authored boards stay parseable)', () => {
    const board = parseDSL('title T\nevent A [800, 300]\ncommand B [500, 600]\nA -> B');
    const map: Record<string, string> = { event_a: 'weird id!', cmd_b: 'weird id!2' };
    const unsafe = {
      ...board,
      elements: board.elements.map((e) => ({ ...e, id: map[e.id]!, label: 'X' })),
      edges: board.edges.map((e) => ({ ...e, from: map[e.from]!, to: map[e.to]! })),
    };
    const out = serializeDSL(unsafe);
    expect(out).toContain('event X [800, 300] (id weird_id)');
    expect(out).toContain('command X [500, 600] (id weird_id_2)');
    expect(out).toContain('#weird_id -> #weird_id_2');
    const round = parseDSL(out);
    expect(round.edges[0]).toMatchObject({ from: 'weird_id', to: 'weird_id_2' });
    expect(serializeDSL(round)).toBe(out);
  });

  it('does not steal an `(id …)` inside a sticky name or a host name', () => {
    const src =
      'title T\nevent Pay (id 1) now [620, 300]\nhotspot H [640, 280] (id hot_h) (on Pay (id 1) now)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    expect(board.elements.find((e) => e.elementType === 'event')?.label).toBe('Pay (id 1) now');
    expect(board.elements.find((e) => e.elementType === 'hotspot')).toMatchObject({
      id: 'hot_h',
      attachedTo: 'event_pay_id_1_now',
    });
    const once = serializeDSL(board);
    // The explicit id is unneeded (unique label) and dropped; the host name stays verbatim.
    expect(once).toContain('hotspot H [640, 280] (on Pay (id 1) now)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('note size (project extension: `(size …)`)', () => {
  it('parses `(size WxH)` combined with a color and round-trips to a fixed point', () => {
    const src = 'title T\nnote Kickoff [80, 80] (color #15803d) (size 240x160)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    const note = board.elements.find((e) => e.elementType === 'note');
    expect(note).toMatchObject({
      label: 'Kickoff',
      color: '#15803d',
      size: { width: 240, height: 160 },
    });
    const once = serializeDSL(board);
    expect(once).toContain('note Kickoff [80, 80] (color #15803d) (size 240x160)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('accepts whitespace around the `x` and canonicalizes suffix order (size last)', () => {
    const src = 'title T\nnote Kickoff [80, 80] (size 240 x 160) (color #15803d)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    const once = serializeDSL(board);
    expect(once).toContain('note Kickoff [80, 80] (color #15803d) (size 240x160)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('keeps `(size 1x1)` inside the note text (size is only read after the coordinates)', () => {
    const src =
      'title T\nnote use (size 1x1) sparingly [80, 80]\nnote use (size 1x1) sparingly [80, 200] (size 240x160)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    const notes = board.elements.filter((e) => e.elementType === 'note');
    expect(notes[0]).toMatchObject({ label: 'use (size 1x1) sparingly' });
    expect(notes[0]).not.toHaveProperty('size');
    expect(notes[1]).toMatchObject({
      label: 'use (size 1x1) sparingly',
      size: { width: 240, height: 160 },
    });
    const once = serializeDSL(board);
    expect(once).toContain('note use (size 1x1) sparingly [80, 80]');
    expect(once).toContain('note use (size 1x1) sparingly [80, 200] (size 240x160)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('malformed size: line-numbered diagnostic, suffix ignored, note still created', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nnote Kickoff [80, 80] (size 240)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(2);
    expect(diagnostics[0]!.message).toContain('(size 240)');
    expect(diagnostics[0]!.text).toContain('note Kickoff');
    const note = board.elements.find((e) => e.elementType === 'note');
    expect(note).toMatchObject({ label: 'Kickoff', position: { x: 80, y: 80 } });
    expect(note).not.toHaveProperty('size');
    const once = serializeDSL(board);
    expect(once).toContain('note Kickoff [80, 80]');
    expect(once).not.toContain('(size');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('a non-positive size is malformed (zero width)', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics('title T\nnote K [80, 80] (size 0x100)');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain('positive');
    expect(board.elements.find((e) => e.elementType === 'note')).not.toHaveProperty('size');
  });

  it('emits `(size …)` only for notes carrying a size (auto notes stay untouched)', () => {
    const board = parseDSL('title T\nnote Manual [80, 80] (size 240x160)\nnote Plain [500, 500]');
    const out = serializeDSL(board);
    expect(out).toContain('note Manual [80, 80] (size 240x160)');
    expect(out).toContain('note Plain [500, 500]\n');
    expect(out.match(/\(size /g)).toHaveLength(1);
    expect(serializeDSL(parseDSL(out))).toBe(out);
  });

  it('`(size …)` on a sticky line yields a diagnostic and is ignored', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics('title T\nevent A [0, 0] (size 100x50)');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.line).toBe(2);
    expect(diagnostics[0]!.message).toContain('only notes support');
    expect(board.elements[0]).toMatchObject({ elementType: 'event', label: 'A' });
    const once = serializeDSL(board);
    expect(once).toContain('event A [0, 0]');
    expect(once).not.toContain('(size');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('`(size …)` on a drawing yields a diagnostic and is ignored', () => {
    const { board, diagnostics } = parseDSLWithDiagnostics(
      'title T\nline [[100, 100], [200, 150]] (dashed) (size 10x10)',
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain('only notes support');
    expect(board.elements.find((e) => e.elementType === 'drawing')).toBeDefined();
    const once = serializeDSL(board);
    expect(once).toContain('line [[100, 100], [200, 150]] (dashed)');
    expect(once).not.toContain('(size');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('does not steal a `(size …)` inside a sticky name or a host name', () => {
    const src =
      'title T\nevent Pay (size 1x1) now [620, 300]\nhotspot H [640, 280] (size 2x2) (on Pay (size 1x1) now)';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    // Exactly ONE finding: the size suffix on the hotspot — the names stay untouched.
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toContain('only notes support');
    expect(board.elements.find((e) => e.elementType === 'event')?.label).toBe('Pay (size 1x1) now');
    expect(board.elements.find((e) => e.elementType === 'hotspot')).toMatchObject({
      attachedTo: 'event_pay_size_1x1_now',
    });
    const once = serializeDSL(board);
    expect(once).toContain('hotspot H [640, 280] (on Pay (size 1x1) now)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});

describe('serializeDSL – huge coordinates', () => {
  it('serializes magnitudes >= 1e21 without exponent notation', () => {
    const board = parseDSL('title T\nevent A [800, 300]\ncommand B [500, 600]\nA -> B');
    const far = {
      ...board,
      elements: board.elements.map((e) =>
        e.label === 'A' ? { ...e, position: { x: 1e21, y: -3e22 } } : e,
      ),
    };
    const out = serializeDSL(far);
    expect(out).toContain('event A [1000000000000000000000, -30000000000000000000000]');
    expect(out).not.toMatch(/e\+/i);
    const round = parseDSL(out);
    expect(round.elements.find((e) => e.label === 'A')?.position).toEqual({ x: 1e21, y: -3e22 });
    expect(round.edges).toHaveLength(1);
    expect(serializeDSL(round)).toBe(out);
  });

  it('round-trips a 24-digit coordinate literal to a fixed point (element and arrow survive)', () => {
    const src = 'title T\nevent A [999999999999999999999999, 300]\ncommand B [500, 600]\nA -> B';
    const { board, diagnostics } = parseDSLWithDiagnostics(src);
    expect(diagnostics).toHaveLength(0);
    const once = serializeDSL(board);
    expect(once).not.toMatch(/e\+/i);
    const reparsed = parseDSL(once);
    expect(reparsed.elements).toHaveLength(2);
    expect(reparsed.edges).toHaveLength(1);
    expect(serializeDSL(reparsed)).toBe(once);
  });
});

describe('element color on every kind (project extension: `(color …)`)', () => {
  it('parses and round-trips the color on all sticky lines', () => {
    const src = `title T
event Order Placed [620, 300] (color #b45309)
command Place Order [240, 300] (color #15803d)
actor Customer [80, 300] (color #6d28d9)
aggregate Order [420, 290] (color #0e7c74)
policy Ship it [800, 300] (color #be123c)
readmodel Order Status [620, 120] (color #1d4ed8)
external Payment Provider [420, 520] (color #a21caf)
hotspot Retry storm? [620, 520] (color #713f12)`;
    const board = parseDSL(src);
    const colorOf = (type: string) => board.elements.find((e) => e.elementType === type)?.color;
    expect(colorOf('event')).toBe('#b45309');
    expect(colorOf('command')).toBe('#15803d');
    expect(colorOf('actor')).toBe('#6d28d9');
    expect(colorOf('aggregate')).toBe('#0e7c74');
    expect(colorOf('policy')).toBe('#be123c');
    expect(colorOf('readmodel')).toBe('#1d4ed8');
    expect(colorOf('external')).toBe('#a21caf');
    expect(colorOf('hotspot')).toBe('#713f12');
    const once = serializeDSL(board);
    expect(once).toContain('command Place Order [240, 300] (color #15803d)');
    expect(once).toContain('hotspot Retry storm? [620, 520] (color #713f12)');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });

  it('round-trips freeform drawings (`line` project extension)', () => {
    const src = `title T
line [[800, 200], [600, 350], [700, 500]] (closed) (dashed) (color #b45309)
line [[300, 100], [250, 400]]`;
    const board = parseDSL(src);
    const drawings = board.elements.filter((e) => e.elementType === 'drawing');
    expect(drawings).toHaveLength(2);
    const shape = drawings[0]!;
    if (shape.elementType === 'drawing') {
      expect(shape.points).toHaveLength(3);
      expect(shape.closed).toBe(true);
      expect(shape.strokeStyle).toBe('dashed');
      expect(shape.color).toBe('#b45309');
    }
    const open = drawings[1]!;
    if (open.elementType === 'drawing') {
      expect(open.closed).toBeUndefined();
      expect(open.strokeStyle).toBeUndefined();
    }
    const once = serializeDSL(board);
    expect(once).toContain(
      'line [[800, 200], [600, 350], [700, 500]] (closed) (dashed) (color #b45309)',
    );
    expect(once).toContain('line [[300, 100], [250, 400]]');
    expect(serializeDSL(parseDSL(once))).toBe(once);
  });
});
