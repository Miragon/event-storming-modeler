// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModuleDeclaration } from 'didi';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import { MODELER_API_VERSION } from '@miragon/modeler-api';
import {
  EVENT_STORMING_NOTATION,
  createCollaborativeModeler,
  createCollaborativeViewer,
  type CollaborativeEventStormingModeler,
} from '../src/collaborative/index.js';

/**
 * Smoke test of the contract wrapper. jsdom cannot lay out SVG, so the importer is a stub and the
 * laws themselves are proven by the conformance kit in the browser project.
 */
function stubImporterModule(onImport: () => void = () => undefined): ModuleDeclaration {
  const importer = {
    clear: vi.fn(),
    import: vi.fn(() => {
      onImport();
      return [{ message: 'stub warning' }];
    }),
  };
  return { eventStormingImporter: ['value', importer] };
}

class NoopHandler {
  execute(): never[] {
    return [];
  }
  revert(): never[] {
    return [];
  }
}

const mounted: CollaborativeEventStormingModeler[] = [];

afterEach(() => {
  for (const modeler of mounted.splice(0)) modeler.destroy();
});

function editor(onImport?: () => void): CollaborativeEventStormingModeler {
  const modeler = createCollaborativeModeler({ additionalModules: [stubImporterModule(onImport)] });
  mounted.push(modeler);
  return modeler;
}

function runNoopCommand(modeler: CollaborativeEventStormingModeler): void {
  const commandStack = modeler.diagram.get<CommandStack>('commandStack');
  commandStack.registerHandler('test.noop', NoopHandler);
  commandStack.execute('test.noop', {});
}

describe('createCollaborativeModeler / createCollaborativeViewer', () => {
  it('declare the notation, the contract version and the editability', () => {
    const viewer = createCollaborativeViewer({ additionalModules: [stubImporterModule()] });
    mounted.push(viewer);
    expect(editor().meta).toEqual({
      notation: EVENT_STORMING_NOTATION,
      apiVersion: MODELER_API_VERSION,
      editable: true,
    });
    expect(viewer.meta).toEqual({
      notation: 'event-storming',
      apiVersion: MODELER_API_VERSION,
      editable: false,
    });
  });

  it('size the diagram to its host', () => {
    const { container } = editor().diagram;
    expect(container.style.width).toBe('100%');
    expect(container.style.height).toBe('100%');
  });

  it('attach the diagram container into the host', () => {
    const modeler = editor();
    const host = document.createElement('div');
    document.body.append(host);
    modeler.attachTo(host);
    expect(modeler.diagram.container.parentElement).toBe(host);
    modeler.destroy();
    expect(host.childElementCount).toBe(0);
    host.remove();
  });

  it('forward command stack changes until unsubscribed', () => {
    const modeler = editor();
    const listener = vi.fn();
    const unsubscribe = modeler.onContentChanged(listener);
    runNoopCommand(modeler);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    modeler.diagram.get<CommandStack>('commandStack').undo();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('forward no view-option or element events', () => {
    const modeler = editor();
    const listener = vi.fn();
    modeler.onContentChanged(listener);
    modeler.diagram
      .get<{ setTypeCaptionsVisible(visible: boolean): void }>('eventStormingViewOptions')
      .setTypeCaptionsVisible(false);
    modeler.diagram
      .get<{ fire(name: string, event: unknown): void }>('eventBus')
      .fire('elements.changed', { elements: [] });
    expect(listener).not.toHaveBeenCalled();
  });

  // Even an engine that emits while importing must not reach the host as an edit.
  it('import silently and resolve the warnings as strings', async () => {
    const holder: { modeler?: CollaborativeEventStormingModeler } = {};
    const modeler = editor(() => holder.modeler && runNoopCommand(holder.modeler));
    holder.modeler = modeler;
    const listener = vi.fn();
    modeler.onContentChanged(listener);
    await expect(modeler.importText('title Fixture\n')).resolves.toEqual({
      warnings: ['stub warning'],
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it('never deliver content changes from the viewer', () => {
    const viewer = createCollaborativeViewer({ additionalModules: [stubImporterModule()] });
    mounted.push(viewer);
    const listener = vi.fn();
    const unsubscribe = viewer.onContentChanged(listener);
    expect(() => viewer.diagram.get('commandStack')).toThrow(/commandStack/);
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('report unknown ids and an empty selection', () => {
    const modeler = editor();
    expect(modeler.elements.list()).toEqual([]);
    expect(modeler.elements.reveal('event_no_such_sticky')).toBe(false);
    expect(modeler.elements.bounds('event_no_such_sticky')).toBeUndefined();
    expect(modeler.elements.selection()).toEqual([]);
    const listener = vi.fn();
    const unsubscribe = modeler.elements.onSelection(listener);
    unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignore view states that are not finite boxes', () => {
    const modeler = editor();
    const viewbox = vi.spyOn(modeler.diagram.get<{ viewbox(): unknown }>('canvas'), 'viewbox');
    for (const state of [
      undefined,
      null,
      'zoom',
      { x: 1, y: 2 },
      { x: 0, y: 0, width: 0, height: 9 },
    ]) {
      modeler.setViewState(state);
    }
    modeler.setViewState({ x: Number.NaN, y: 0, width: 10, height: 10 });
    expect(viewbox).not.toHaveBeenCalled();
  });

  it('destroy idempotently and stop answering afterwards', () => {
    const modeler = editor();
    modeler.destroy();
    expect(() => modeler.destroy()).not.toThrow();
    expect(modeler.getViewState()).toBeUndefined();
    expect(modeler.elements.reveal('anything')).toBe(false);
    expect(modeler.elements.bounds('anything')).toBeUndefined();
    expect(modeler.elements.list()).toEqual([]);
    expect(modeler.elements.selection()).toEqual([]);
  });

  // A host that flushes a debounced save on unmount must neither build a new diagram (with its
  // document key listener) on the detached container nor lose the last state.
  it('answer exportText from the state at destroy and reject imports afterwards', async () => {
    const modeler = editor();
    const before = modeler.exportText();
    const containers = document.querySelectorAll('.event-storming-container').length;
    modeler.destroy();
    expect(modeler.exportText()).toBe(before);
    await expect(modeler.importText('title Later\n')).rejects.toThrow(/destroyed/);
    expect(document.querySelectorAll('.event-storming-container').length).toBeLessThanOrEqual(
      containers,
    );
  });
});
