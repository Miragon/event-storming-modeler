import { describe, it, expect } from 'vitest';
import {
  createEmptyBoard,
  type ActorElement,
  type AggregateElement,
  type CommandElement,
  type DomainEventElement,
  type DrawingElement,
  type EventStormingBoard,
  type NoteElement,
  type ReadModelElement,
} from '@miragon/event-storming-schema-model';
import {
  moveElement,
  moveBy,
  setStickyKind,
  setColor,
  clearColor,
  alignToRows,
  spreadTimeline,
} from '../src/index.js';

function boardWith(...elements: EventStormingBoard['elements']): EventStormingBoard {
  return { ...createEmptyBoard('T'), elements };
}

const event: DomainEventElement = {
  id: 'event_x',
  elementType: 'event',
  label: 'Order Placed',
  position: { x: 620, y: 300 },
};

const note: NoteElement = {
  id: 'note_1',
  elementType: 'note',
  label: 'Big-picture session',
  position: { x: 80, y: 80 },
};

describe('transforms', () => {
  it('moveElement sets the position immutably', () => {
    const before = boardWith(event);
    const after = moveElement(before, 'event_x', { x: 100, y: -40 });
    expect(before.elements[0]).toBe(event);
    expect(after.elements[0]?.position).toEqual({ x: 100, y: -40 });
  });

  it('moveBy shifts the position by the delta and keeps the other fields', () => {
    const colored: DomainEventElement = { ...event, color: '#ff0000' };
    const after = moveBy(boardWith(colored), 'event_x', { dx: -20, dy: 35 });
    const x = after.elements[0];
    expect(x?.position).toEqual({ x: 600, y: 335 });
    expect(x?.label).toBe('Order Placed');
    expect(x?.color).toBe('#ff0000');
  });

  it("moveBy translates a drawing's points together with its position", () => {
    const drawing: DrawingElement = {
      id: 'draw_1',
      elementType: 'drawing',
      label: '',
      position: { x: 100, y: 100 },
      points: [
        { x: 100, y: 100 },
        { x: 200, y: 150 },
      ],
      strokeStyle: 'dashed',
    };
    const after = moveBy(boardWith(drawing), 'draw_1', { dx: 10, dy: -10 });
    const d = after.elements[0];
    expect(d?.elementType === 'drawing' && d.points).toEqual([
      { x: 110, y: 90 },
      { x: 210, y: 140 },
    ]);
    expect(d?.position).toEqual({ x: 110, y: 90 });
  });

  it('moveElement throws for unknown ids', () => {
    expect(() => moveElement(boardWith(event), 'missing', { x: 0, y: 0 })).toThrow(
      'Element "missing" not found.',
    );
  });

  it('setStickyKind retypes a sticky preserving id, label, position and color', () => {
    const command: CommandElement = {
      id: 'cmd_1',
      elementType: 'command',
      label: 'Place Order',
      position: { x: 240, y: 300 },
      color: '#00ff00',
    };
    const after = setStickyKind(boardWith(command), 'cmd_1', 'event');
    expect(after.elements[0]).toEqual({
      id: 'cmd_1',
      elementType: 'event',
      label: 'Place Order',
      position: { x: 240, y: 300 },
      color: '#00ff00',
    });
  });

  it('setStickyKind throws on notes and drawings', () => {
    expect(() => setStickyKind(boardWith(note), 'note_1', 'event')).toThrow(
      'setStickyKind only applies to stickies; "note_1" is note.',
    );
  });

  it('setColor sets and clearColor removes the override', () => {
    const set = setColor(boardWith(event), 'event_x', '#123456');
    expect(set.elements[0]?.color).toBe('#123456');
    const cleared = clearColor(set, 'event_x');
    const x = cleared.elements[0];
    expect(x && 'color' in x).toBe(false);
  });

  it('alignToRows snaps sticky y to per-kind lanes and leaves notes and drawings untouched', () => {
    const readmodel: ReadModelElement = {
      id: 'read_1',
      elementType: 'readmodel',
      label: 'Order Status',
      position: { x: 600, y: 95 },
    };
    const aggregate: AggregateElement = {
      id: 'agg_1',
      elementType: 'aggregate',
      label: 'Order',
      position: { x: 400, y: 280 },
    };
    const after = alignToRows(boardWith(readmodel, aggregate, event, note));
    expect(after.elements.find((e) => e.id === 'read_1')?.position).toEqual({ x: 600, y: 120 });
    expect(after.elements.find((e) => e.id === 'agg_1')?.position).toEqual({ x: 400, y: 320 });
    expect(after.elements.find((e) => e.id === 'event_x')?.position).toEqual({ x: 620, y: 420 });
    expect(after.elements.find((e) => e.id === 'note_1')).toBe(note);
  });

  it('spreadTimeline redistributes sticky x in timeline order starting at the minimum x', () => {
    const actor: ActorElement = {
      id: 'actor_1',
      elementType: 'actor',
      label: 'Customer',
      position: { x: 100, y: 220 },
    };
    const command: CommandElement = {
      id: 'cmd_1',
      elementType: 'command',
      label: 'Place Order',
      position: { x: 500, y: 320 },
    };
    const bunched: DomainEventElement = { ...event, position: { x: 300, y: 420 } };
    const board = boardWith(command, actor, bunched, note);
    const after = spreadTimeline(board);
    expect(after.elements.find((e) => e.id === 'actor_1')?.position).toEqual({ x: 100, y: 220 });
    expect(after.elements.find((e) => e.id === 'event_x')?.position).toEqual({ x: 280, y: 420 });
    expect(after.elements.find((e) => e.id === 'cmd_1')?.position).toEqual({ x: 460, y: 320 });
    expect(after.elements.find((e) => e.id === 'note_1')).toBe(note);
    // Input stays untouched and a custom gap is honored.
    expect(board.elements.find((e) => e.id === 'cmd_1')?.position.x).toBe(500);
    const tight = spreadTimeline(board, { gap: 10 });
    expect(tight.elements.find((e) => e.id === 'cmd_1')?.position.x).toBe(120);
  });
});
