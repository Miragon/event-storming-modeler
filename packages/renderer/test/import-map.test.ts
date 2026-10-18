// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModuleDeclaration } from 'didi';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type { EventStormingBaseViewer } from '../src/EventStormingBaseViewer.js';
import { Modeler } from '../src/Modeler.js';
import { NavigatedViewer } from '../src/NavigatedViewer.js';
import { Viewer } from '../src/Viewer.js';

/**
 * jsdom cannot lay out SVG, so the real importer is swapped for a stub: these cases are about the
 * import lifecycle around it (command stack, events), the rendering is covered in the browser.
 */
function stubImporterModule(): ModuleDeclaration {
  return { eventStormingImporter: ['value', { clear: vi.fn(), import: vi.fn(() => []) }] };
}

class NoopHandler {
  execute(): never[] {
    return [];
  }
  revert(): never[] {
    return [];
  }
}

const viewers: EventStormingBaseViewer[] = [];

afterEach(() => {
  for (const viewer of viewers.splice(0)) viewer.destroy();
});

function track<T extends EventStormingBaseViewer>(viewer: T): T {
  viewers.push(viewer);
  return viewer;
}

function firedEvents(viewer: EventStormingBaseViewer, names: string[]): string[] {
  const fired: string[] = [];
  for (const name of names) viewer.on(name, () => fired.push(name));
  return fired;
}

describe('importMap: history reset', () => {
  // A host re-imports on every remote change; an import that emitted commandStack.changed would
  // be echoed back as an edit of the hand-authored text.
  it('erases existing undo history without firing commandStack.changed', async () => {
    const modeler = track(new Modeler({ additionalModules: [stubImporterModule()] }));
    const commandStack = modeler.get<CommandStack>('commandStack');
    commandStack.registerHandler('test.noop', NoopHandler);
    commandStack.execute('test.noop', {});
    expect(commandStack.canUndo()).toBe(true);

    const fired = firedEvents(modeler, ['commandStack.changed', 'import.done']);
    await modeler.importDSL('title Fixture\n');

    expect(fired).toEqual(['import.done']);
    expect(commandStack.canUndo()).toBe(false);
  });

  it('fires import.parse.start before import.done', async () => {
    const modeler = track(new Modeler({ additionalModules: [stubImporterModule()] }));
    const fired = firedEvents(modeler, ['import.done', 'import.parse.start', 'import.parse.done']);
    await modeler.importDSL('title Fixture\n');
    expect(fired).toEqual(['import.parse.start', 'import.parse.done', 'import.done']);
  });

  // The viewers register no command stack; the read-only contract mount relies on that.
  it.each([
    ['Viewer', () => new Viewer({ additionalModules: [stubImporterModule()] })],
    ['NavigatedViewer', () => new NavigatedViewer({ additionalModules: [stubImporterModule()] })],
  ])('lets a %s import without a command stack', async (_name, create) => {
    const viewer = track(create());
    expect(() => viewer.get('commandStack')).toThrow(/commandStack/);
    const fired = firedEvents(viewer, ['import.done']);
    await expect(viewer.importDSL('title Fixture\n')).resolves.toEqual({ warnings: [] });
    expect(fired).toEqual(['import.done']);
  });
});
