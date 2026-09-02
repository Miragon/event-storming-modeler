import { describe, it, expect } from 'vitest';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { EventStormingBoard } from '@miragon/event-storming-schema-model';
import EventStormingImporter from '../src/io/EventStormingImporter.js';
import EventStormingElementFactory from '../src/model/EventStormingElementFactory.js';
import type BoardBounds from '../src/board-bounds/BoardBounds.js';

function importerHarness() {
  const addedShapeIds: string[] = [];
  const rawFactory = {
    createShape: (attrs: Record<string, unknown>) => attrs,
    createConnection: (attrs: Record<string, unknown>) => attrs,
    createRoot: (attrs: Record<string, unknown>) => attrs,
  } as unknown as ElementFactory;
  const canvas = {
    getRootElement: () => {
      throw new Error('no root yet');
    },
    setRootElement: () => {},
    addShape: (shape: { id: string }) => addedShapeIds.push(shape.id),
    addConnection: () => {},
    viewbox: () => {},
  } as unknown as Canvas;
  const importer = new EventStormingImporter(
    canvas,
    rawFactory,
    new EventStormingElementFactory(rawFactory, { getAll: () => [] } as unknown as ElementRegistry),
    { contentBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }) } as unknown as BoardBounds,
    { fire: () => {} } as unknown as EventBus,
    { getAll: () => [] } as unknown as ElementRegistry,
  );
  return { importer, addedShapeIds };
}

describe('EventStormingImporter: z-order', () => {
  // Regression: notes had their own back band on import, while interactive editing appends them
  // on top like stickies — the stacking of overlapping note/sticky pairs flipped on reload.
  it('keeps stickies and notes in document order (note listed after a sticky stays on top)', () => {
    const board = {
      config: { title: 'Fixture' },
      elements: [
        {
          id: 'event_order_placed',
          elementType: 'event',
          label: 'Order Placed',
          position: { x: 200, y: 200 },
        },
        { id: 'note_risk', elementType: 'note', label: 'Risk', position: { x: 210, y: 210 } },
      ],
      edges: [],
    } as unknown as EventStormingBoard;

    const { importer, addedShapeIds } = importerHarness();
    expect(importer.import(board)).toEqual([]);
    expect(addedShapeIds).toEqual(['event_order_placed', 'note_risk']);
  });

  it('still moves drawings to the very back regardless of document order', () => {
    const board = {
      config: { title: 'Fixture' },
      elements: [
        { id: 'note_risk', elementType: 'note', label: 'Risk', position: { x: 0, y: 0 } },
        {
          id: 'draw_circle',
          elementType: 'drawing',
          label: '',
          position: { x: 0, y: 0 },
          points: [
            { x: 0, y: 0 },
            { x: 50, y: 50 },
          ],
        },
        {
          id: 'event_order_placed',
          elementType: 'event',
          label: 'Order Placed',
          position: { x: 200, y: 200 },
        },
      ],
      edges: [],
    } as unknown as EventStormingBoard;

    const { importer, addedShapeIds } = importerHarness();
    expect(importer.import(board)).toEqual([]);
    expect(addedShapeIds).toEqual(['draw_circle', 'note_risk', 'event_order_placed']);
  });
});
