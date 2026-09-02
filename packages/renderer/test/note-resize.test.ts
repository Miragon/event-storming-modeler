import { describe, it, expect } from 'vitest';
import EventBus from 'diagram-js/lib/core/EventBus';
import CommandStack from 'diagram-js/lib/command/CommandStack';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementFactory from 'diagram-js/lib/core/ElementFactory';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type { Injector } from 'didi';
import type { EventStormingBoard } from '@miragon/event-storming-schema-model';
import EventStormingImporter from '../src/io/EventStormingImporter.js';
import EventStormingExporter from '../src/io/EventStormingExporter.js';
import EventStormingElementFactory from '../src/model/EventStormingElementFactory.js';
import EventStormingModeling from '../src/modeling/EventStormingModeling.js';
import EventStormingResizeBehavior from '../src/resize/EventStormingResizeBehavior.js';
import type BoardBounds from '../src/board-bounds/BoardBounds.js';
import type { EventStormingShape } from '../src/model/di-types.js';
import { NOTE_MIN_RESIZE, isManualNoteBox, noteMetrics } from '../src/draw/styles.js';
import { ROOT_ID } from '../src/io/types.js';

/** Importer + exporter over the same shape store — the mock factory returns plain attrs. */
function ioHarness() {
  const shapes: EventStormingShape[] = [];
  let root: Record<string, unknown> | undefined;
  const rawFactory = {
    createShape: (attrs: Record<string, unknown>) => attrs,
    createConnection: (attrs: Record<string, unknown>) => attrs,
    createRoot: (attrs: Record<string, unknown>) => attrs,
  } as unknown as ElementFactory;
  const canvas = {
    getRootElement: () => {
      if (!root) throw new Error('no root yet');
      return root;
    },
    setRootElement: (r: Record<string, unknown>) => (root = r),
    addShape: (shape: EventStormingShape) => shapes.push(shape),
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
  const exporter = new EventStormingExporter(
    { getAll: () => shapes } as unknown as ElementRegistry,
    canvas,
  );
  const byId = (id: string) => shapes.find((s) => s.id === id);
  return { importer, exporter, byId };
}

function board(elements: unknown[]): EventStormingBoard {
  return { config: { title: 'Fixture' }, elements, edges: [] } as unknown as EventStormingBoard;
}

describe('Note resize: import -> export round-trip', () => {
  it('imports a manual `size` as the note box (centered) and exports it back verbatim', () => {
    const { importer, exporter, byId } = ioHarness();
    importer.import(
      board([
        {
          id: 'note_kickoff',
          elementType: 'note',
          label: 'Kickoff',
          position: { x: 300, y: 200 },
          size: { width: 240, height: 160 },
        },
      ]),
    );

    const shape = byId('note_kickoff')!;
    expect(shape.width).toBe(240);
    expect(shape.height).toBe(160);
    expect(shape.x).toBe(300 - 240 / 2);
    expect(shape.y).toBe(200 - 160 / 2);

    const exported = exporter.export().elements.find((e) => e.id === 'note_kickoff');
    if (exported?.elementType !== 'note') throw new Error('note missing');
    expect(exported.size).toEqual({ width: 240, height: 160 });
    expect(exported.position).toEqual({ x: 300, y: 200 });
  });

  it('keeps auto notes size-less: text metrics on import, NO `size` on export', () => {
    const { importer, exporter, byId } = ioHarness();
    importer.import(
      board([
        { id: 'note_hint', elementType: 'note', label: 'Hint', position: { x: 100, y: 100 } },
      ]),
    );

    const metrics = noteMetrics('Hint');
    expect(byId('note_hint')!.width).toBe(metrics.width);
    expect(byId('note_hint')!.height).toBe(metrics.height);

    const exported = exporter.export().elements.find((e) => e.id === 'note_hint');
    if (exported?.elementType !== 'note') throw new Error('note missing');
    expect('size' in exported).toBe(false);
  });

  it('exports the auto-vs-manual verdict from the CURRENT box, not the imported flag', () => {
    const { importer, exporter, byId } = ioHarness();
    importer.import(
      board([
        { id: 'note_hint', elementType: 'note', label: 'Hint', position: { x: 100, y: 100 } },
      ]),
    );

    // A resize (e.g. the stock shape.resize command) mutates the box in place — the exporter
    // must pick it up as manual without any extra bookkeeping.
    const shape = byId('note_hint')!;
    shape.width = 240;
    shape.height = 160;

    const exported = exporter.export().elements.find((e) => e.id === 'note_hint');
    if (exported?.elementType !== 'note') throw new Error('note missing');
    expect(exported.size).toEqual({ width: 240, height: 160 });
  });
});

/** Real EventBus + CommandStack so updateLabel runs through the actual command handler. */
function modelingHarness() {
  const eventBus = new EventBus();
  const commandStack = new CommandStack(eventBus, {
    instantiate: (Type: new () => unknown) => new Type(),
  } as unknown as Injector);
  const modeling = new EventStormingModeling(
    commandStack,
    { getRootElement: () => ({ id: ROOT_ID }) } as unknown as Canvas,
    { get: () => undefined } as unknown as ElementRegistry,
  );
  return { commandStack, modeling };
}

function noteShape(label: string, box?: { width: number; height: number }): EventStormingShape {
  const { width, height } = box ?? noteMetrics(label);
  return {
    id: 'note_kickoff',
    eventStormingType: 'note',
    eventStormingLabel: label,
    x: 100,
    y: 100,
    width,
    height,
  } as unknown as EventStormingShape;
}

describe('EventStormingModeling.updateLabel: manual vs auto note boxes', () => {
  it('preserves a MANUAL box on relabel (the user chose it) — undo restores the label', () => {
    const { commandStack, modeling } = modelingHarness();
    const note = noteShape('Kickoff', { width: 240, height: 160 });

    modeling.updateLabel(note, 'Kickoff v2');
    expect(note.eventStormingLabel).toBe('Kickoff v2');
    expect(note.width).toBe(240);
    expect(note.height).toBe(160);
    expect(note.x).toBe(100);
    expect(note.y).toBe(100);

    commandStack.undo();
    expect(note.eventStormingLabel).toBe('Kickoff');
    expect(note.width).toBe(240);
  });

  it('recomputes an AUTO box to the new text metrics, keeping the center', () => {
    const { modeling } = modelingHarness();
    const note = noteShape('Kickoff');
    const cx = note.x + note.width / 2;
    const cy = note.y + note.height / 2;

    modeling.updateLabel(note, 'A much longer note label\nsecond line');
    const expected = noteMetrics('A much longer note label\nsecond line');
    expect(note.width).toBe(expected.width);
    expect(note.height).toBe(expected.height);
    expect(note.x + note.width / 2).toBe(cx);
    expect(note.y + note.height / 2).toBe(cy);
  });
});

describe('EventStormingResizeBehavior: minimum bounds', () => {
  function minDimensionsFor(shape: unknown) {
    const eventBus = new EventBus();
    new EventStormingResizeBehavior(eventBus);
    const context: { shape: unknown; minDimensions?: { width: number; height: number } } = {
      shape,
    };
    eventBus.fire('resize.start', { context });
    return context.minDimensions;
  }

  it('clamps note resizing to NOTE_MIN_RESIZE (60x40) via resize.start minDimensions', () => {
    expect(minDimensionsFor(noteShape('Hint'))).toEqual({ width: 60, height: 40 });
    expect(NOTE_MIN_RESIZE).toEqual({ width: 60, height: 40 });
  });

  it('leaves non-note shapes alone (they are not resizable in the first place)', () => {
    const sticky = { id: 'cmd_x', eventStormingType: 'command', eventStormingLabel: 'X' };
    expect(minDimensionsFor(sticky)).toBeUndefined();
    expect(minDimensionsFor(undefined)).toBeUndefined();
  });
});

describe('isManualNoteBox: the shared auto-vs-manual rule', () => {
  it('is manual iff the box differs from noteMetrics(label)', () => {
    const metrics = noteMetrics('Hint');
    expect(isManualNoteBox('Hint', metrics)).toBe(false);
    expect(isManualNoteBox('Hint', { width: metrics.width + 1, height: metrics.height })).toBe(
      true,
    );
    expect(isManualNoteBox('Hint', { width: metrics.width, height: metrics.height - 1 })).toBe(
      true,
    );
  });
});

describe('noteMetrics: measures the plain note text (markdown markers are invisible)', () => {
  it('sizes markdown labels by their rendered text, not the raw marker characters', () => {
    expect(noteMetrics('**Check legal**')).toEqual(noteMetrics('Check legal'));
    expect(noteMetrics('*a* and ***b***')).toEqual(noteMetrics('a and b'));
  });

  it("counts the visible '• ' prefix of bullet lines", () => {
    // Rendered as '• todo' (6 chars): 2 chars wider than bare 'todo', markers not counted.
    expect(noteMetrics('- **todo**').width).toBe(noteMetrics('• todo').width);
    expect(noteMetrics('- todo').width).toBeGreaterThan(noteMetrics('todo').width);
  });

  it('keeps the auto-vs-manual verdict stable for formatted labels', () => {
    expect(isManualNoteBox('**Check legal**', noteMetrics('**Check legal**'))).toBe(false);
    expect(isManualNoteBox('**Check legal**', noteMetrics('Check legal'))).toBe(false);
  });
});

describe('Note align: import -> export round-trip', () => {
  it('mirrors NoteElement.align into the DI props and exports it back', () => {
    const { importer, exporter, byId } = ioHarness();
    importer.import(
      board([
        {
          id: 'note_kickoff',
          elementType: 'note',
          label: 'Kickoff',
          position: { x: 300, y: 200 },
          align: { horizontal: 'center', vertical: 'middle' },
        },
      ]),
    );

    const shape = byId('note_kickoff')!;
    expect(shape.alignHorizontal).toBe('center');
    expect(shape.alignVertical).toBe('middle');

    const exported = exporter.export().elements.find((e) => e.id === 'note_kickoff');
    if (exported?.elementType !== 'note') throw new Error('note missing');
    expect(exported.align).toEqual({ horizontal: 'center', vertical: 'middle' });
  });

  it('keeps unaligned notes align-free (defaults never serialize)', () => {
    const { importer, exporter, byId } = ioHarness();
    importer.import(
      board([
        { id: 'note_hint', elementType: 'note', label: 'Hint', position: { x: 100, y: 100 } },
      ]),
    );

    expect(byId('note_hint')!.alignHorizontal).toBeUndefined();
    expect(byId('note_hint')!.alignVertical).toBeUndefined();

    const exported = exporter.export().elements.find((e) => e.id === 'note_hint');
    if (exported?.elementType !== 'note') throw new Error('note missing');
    expect('align' in exported).toBe(false);
  });

  it('collapses explicitly-default axes to absent on export', () => {
    const { importer, exporter, byId } = ioHarness();
    importer.import(
      board([
        {
          id: 'note_hint',
          elementType: 'note',
          label: 'Hint',
          position: { x: 100, y: 100 },
          align: { horizontal: 'left', vertical: 'bottom' },
        },
      ]),
    );

    // The default axis never reaches the DI props; the deviating one does.
    expect(byId('note_hint')!.alignHorizontal).toBeUndefined();
    expect(byId('note_hint')!.alignVertical).toBe('bottom');

    // An editor writing defaults back (instead of deleting the props) still exports canonically.
    byId('note_hint')!.alignVertical = 'top';
    const exported = exporter.export().elements.find((e) => e.id === 'note_hint');
    if (exported?.elementType !== 'note') throw new Error('note missing');
    expect('align' in exported).toBe(false);
  });

  it('exports the CURRENT align DI props (edits picked up without extra bookkeeping)', () => {
    const { importer, exporter, byId } = ioHarness();
    importer.import(
      board([
        { id: 'note_hint', elementType: 'note', label: 'Hint', position: { x: 100, y: 100 } },
      ]),
    );

    byId('note_hint')!.alignHorizontal = 'right';
    const exported = exporter.export().elements.find((e) => e.id === 'note_hint');
    if (exported?.elementType !== 'note') throw new Error('note missing');
    expect(exported.align).toEqual({ horizontal: 'right' });
  });
});
