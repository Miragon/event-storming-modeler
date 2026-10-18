import {
  MODELER_API_VERSION,
  type CollaborativeModeler,
  type ElementInfo,
  type ElementsSurface,
  type ImportResult,
  type ModelerMeta,
} from '@miragon/modeler-api';
import type { ModuleDeclaration } from 'didi';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import { Modeler } from '../Modeler.js';
import { NavigatedViewer } from '../NavigatedViewer.js';
import type { EventStormingViewerOptions } from '../EventStormingBaseViewer.js';
import { plainNoteText } from '../draw/index.js';
import {
  isEventStormingConnection,
  isEventStormingShape,
  type EventStormingConnection,
  type EventStormingShape,
} from '../model/di-types.js';

/** Stable notation id in `meta.notation` of the collaborative-modeler contract. */
export const EVENT_STORMING_NOTATION = 'event-storming';

export interface CollaborativeEventStormingOptions {
  /** Appended to the renderer's own modules (e.g. a host's chrome module). */
  additionalModules?: ModuleDeclaration[] | undefined;
  /** See `EventStormingViewerOptions.undoRedoKeys` (default true). */
  undoRedoKeys?: boolean | undefined;
}

/** The contract surface plus the wrapped diagram for host-specific wiring. */
export interface CollaborativeEventStormingModeler extends CollaborativeModeler {
  readonly elements: ElementsSurface;
  readonly diagram: Modeler | NavigatedViewer;
}

interface ViewState {
  x: number;
  y: number;
  width: number;
  height: number;
}

type BoardElement = EventStormingShape | EventStormingConnection;

/** The editing mount (`meta.editable: true`) of the collaborative-modeler contract. */
export function createCollaborativeModeler(
  options: CollaborativeEventStormingOptions = {},
): CollaborativeEventStormingModeler {
  return collaborative(
    new Modeler({ ...diagramOptions(options), undoRedoKeys: options.undoRedoKeys ?? true }),
    true,
  );
}

/** The read-only mount (`meta.editable: false`): imports, exports and reveals, never edits. */
export function createCollaborativeViewer(
  options: Omit<CollaborativeEventStormingOptions, 'undoRedoKeys'> = {},
): CollaborativeEventStormingModeler {
  return collaborative(new NavigatedViewer(diagramOptions(options)), false);
}

function diagramOptions(options: CollaborativeEventStormingOptions): EventStormingViewerOptions {
  return { width: '100%', height: '100%', additionalModules: options.additionalModules ?? [] };
}

function collaborative(
  diagram: Modeler | NavigatedViewer,
  editable: boolean,
): CollaborativeEventStormingModeler {
  const eventBus = diagram.get<EventBus>('eventBus');
  const canvas = diagram.get<Canvas>('canvas');
  const elementRegistry = diagram.get<ElementRegistry>('elementRegistry');
  const selection = diagram.get<Selection>('selection');
  const contentListeners = new Set<() => void>();
  let importsRunning = 0;
  let destroyed = false;

  const meta: ModelerMeta = {
    notation: EVENT_STORMING_NOTATION,
    apiVersion: MODELER_API_VERSION,
    editable,
  };

  if (editable) {
    eventBus.on('commandStack.changed', () => {
      if (importsRunning > 0) return;
      for (const listener of [...contentListeners]) listener();
    });
  }

  const elements: ElementsSurface = {
    list: () =>
      (elementRegistry.getAll() as unknown[])
        .filter(isBoardElement)
        .map((element) => elementInfo(element)),
    reveal(id) {
      if (destroyed) return false;
      const element = elementRegistry.get(id);
      if (!isBoardElement(element)) return false;
      selection.select(element);
      canvas.scrollToElement(element);
      return true;
    },
    selection: () => boardElementIds(selection.get()),
    onSelection(callback) {
      const listener = (event: unknown) =>
        callback(boardElementIds((event as { newSelection?: unknown[] }).newSelection ?? []));
      eventBus.on('selection.changed', listener);
      return () => eventBus.off('selection.changed', listener);
    },
  };

  return {
    meta,
    elements,
    diagram,
    attachTo(host) {
      diagram.attachTo(host);
    },
    async importText(text): Promise<ImportResult> {
      importsRunning += 1;
      try {
        const { warnings } = await diagram.importDSL(text);
        return { warnings: warnings.map((warning) => warning.message) };
      } finally {
        importsRunning -= 1;
      }
    },
    exportText: () => diagram.exportDSL(),
    onContentChanged(callback) {
      if (!editable) return () => undefined;
      contentListeners.add(callback);
      return () => contentListeners.delete(callback);
    },
    getViewState(): ViewState | undefined {
      if (destroyed) return undefined;
      try {
        const { x, y, width, height } = canvas.viewbox();
        const state = { x, y, width, height };
        return isViewState(state) ? state : undefined;
      } catch {
        return undefined;
      }
    },
    setViewState(state) {
      if (destroyed || !isViewState(state)) return;
      canvas.viewbox({ x: state.x, y: state.y, width: state.width, height: state.height });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      contentListeners.clear();
      diagram.destroy();
    },
  };
}

function isBoardElement(element: unknown): element is BoardElement {
  return isEventStormingShape(element) || isEventStormingConnection(element);
}

function boardElementIds(elements: readonly unknown[]): string[] {
  return elements.filter(isBoardElement).map((element) => element.id);
}

function elementInfo(element: BoardElement): ElementInfo {
  const name = isEventStormingConnection(element)
    ? element.linkLabel
    : element.eventStormingType === 'note'
      ? plainNoteText(element.eventStormingLabel)
      : element.eventStormingLabel;
  return name ? { id: element.id, name } : { id: element.id };
}

function isViewState(state: unknown): state is ViewState {
  if (typeof state !== 'object' || state === null) return false;
  const { x, y, width, height } = state as Record<string, unknown>;
  return (
    isFiniteNumber(x) &&
    isFiniteNumber(y) &&
    isFiniteNumber(width) &&
    isFiniteNumber(height) &&
    width > 0 &&
    height > 0
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
