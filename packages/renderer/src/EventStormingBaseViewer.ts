import Diagram from 'diagram-js/lib/Diagram';
import type { ModuleDeclaration } from 'didi';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type PopupMenu from 'diagram-js/lib/features/popup-menu/PopupMenu';
import type { EventStormingBoard } from '@miragon/event-storming-schema-model';
import { parseDSLWithDiagnostics, serializeDSL } from '@miragon/event-storming-dsl';
import { saveSVG } from './io/saveSvg.js';
import type EventStormingImporter from './io/EventStormingImporter.js';
import type EventStormingExporter from './io/EventStormingExporter.js';
import type BoardBounds from './board-bounds/BoardBounds.js';
import type EventStormingLabelEditing from './label-editing/EventStormingLabelEditing.js';
import { ROOT_ID, type ImportWarning } from './io/types.js';
import {
  resolveFreeArea,
  type FreeArea,
  type FreeRectInsets,
} from './palette/EventStormingPaletteProvider.js';

export interface EventStormingViewerOptions {
  /** Host element. If missing, a detached <div> is created (can be attached later via attachTo). */
  container?: HTMLElement;
  width?: number | string;
  height?: number | string;
  /** Concatenated to the end of the module list (extension point). */
  additionalModules?: ModuleDeclaration[];
  /**
   * Bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y to the board's undo/redo (default true).
   * Pass false when the host owns the history (the VS Code document), so the keys reach it.
   */
  undoRedoKeys?: boolean | undefined;
  /**
   * Where the host's chrome leaves the canvas free (palette row, zoom panel), as the margins it
   * covers (`{ insets }`) or the free centre in diagram coordinates (`{ center }`). An element
   * created from the palette with Enter or Space lands in that centre (guide §5.5); without it, in
   * the centre of the container. The modeler-api name.
   */
  freeArea?: FreeArea | undefined;
  /**
   * @deprecated Pass `freeArea: { insets }` instead. Accepted until the next minor release;
   * `freeArea` wins when both are given.
   */
  freeRectInsets?: (() => FreeRectInsets) | undefined;
  /**
   * Fit the board into the view after every import (default true). A host whose chrome fits the
   * content itself (the modeler shell's viewport, into the free area) passes false and sets the
   * view after the import.
   */
  fitOnImport?: boolean | undefined;
}

export type EventCallback<T = unknown> = (event: T) => void;

/**
 * Board ids become diagram-js ids next to the root elements; a collision would throw only after
 * the previous board was cleared. Checked first, so such a board is rejected without a trace.
 */
function assertNoEngineIds(board: EventStormingBoard): void {
  for (const { id } of [...board.elements, ...board.edges]) {
    if (id === ROOT_ID || id.startsWith('__implicitroot')) {
      throw new Error(`Element id "${id}" is reserved for the board itself.`);
    }
  }
}

function sizeToCss(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value;
}

/**
 * Shared lifecycle & DI bootstrap for all Event Storming viewers (analogous to bpmn-js
 * BaseViewer, but OUR OWN code — no bpmn-js as a dependency). Subclasses only override
 * `_getModules()` (a method rather than a field, to sidestep the constructor/field
 * initialization order). `attachTo`/`detach` are own implementations (not a diagram-js
 * primitive).
 */
export abstract class EventStormingBaseViewer {
  protected abstract _getModules(): ModuleDeclaration[];

  private _diagram: Diagram | undefined;
  private readonly _container: HTMLElement;
  private readonly _options: EventStormingViewerOptions;

  constructor(options: EventStormingViewerOptions = {}) {
    this._options = options;
    this._container = this._createContainer(options);
  }

  private _createContainer(options: EventStormingViewerOptions): HTMLElement {
    const container = options.container ?? document.createElement('div');
    container.classList.add('event-storming-container');
    container.style.width = sizeToCss(options.width ?? '100%');
    container.style.height = sizeToCss(options.height ?? (options.container ? '100%' : '600px'));
    return container;
  }

  private _ensureDiagram(): Diagram {
    if (!this._diagram) {
      const modules = [...this._getModules(), ...(this._options.additionalModules ?? [])];
      this._diagram = new Diagram({
        canvas: { container: this._container },
        modules,
        eventStormingKeyboard: { undoRedoKeys: this._options.undoRedoKeys ?? true },
        eventStormingPalette: { freeArea: resolveFreeArea(this._options) },
        eventStormingImporter: { fitOnImport: this._options.fitOnImport ?? true },
      });
    }
    return this._diagram;
  }

  get<T>(name: string): T {
    return this._ensureDiagram().get<T>(name);
  }

  on<T = unknown>(event: string, callback: EventCallback<T>, priority = 1000): void {
    this.get<EventBus>('eventBus').on(event, priority, callback as EventCallback);
  }

  off(event: string, callback: EventCallback): void {
    this.get<EventBus>('eventBus').off(event, callback);
  }

  /** Load a board into the canvas (replaces existing content). */
  async importMap(board: EventStormingBoard): Promise<{ warnings: ImportWarning[] }> {
    const diagram = this._ensureDiagram();
    const eventBus = diagram.get<EventBus>('eventBus');
    const importer = diagram.get<EventStormingImporter>('eventStormingImporter');
    assertNoEngineIds(board);
    const labelEditing = diagram.get<EventStormingLabelEditing>('eventStormingLabelEditing', false);
    labelEditing?.suspend();
    diagram.get<PopupMenu>('popupMenu', false)?.close();
    importer.clear();
    const warnings = importer.import(board);
    // Discard the PREVIOUS board's undo history: undo on orphaned elements would otherwise
    // crash or insert zombie elements into the new board. Silently, because an import is no
    // content change (hosts would echo it back), and only where a stack exists: the viewers
    // have none.
    diagram.get<CommandStack>('commandStack', false)?.clear(false);
    eventBus.fire('import.done', { warnings });
    labelEditing?.resumeAfterImport();
    return { warnings };
  }

  /** Load `.storm` DSL text (internally parse -> importMap). Parser findings land in the warnings. */
  async importDSL(text: string): Promise<{ warnings: ImportWarning[] }> {
    const eventBus = this._ensureDiagram().get<EventBus>('eventBus');
    eventBus.fire('import.parse.start', { text });
    const { board, diagnostics } = parseDSLWithDiagnostics(text);
    eventBus.fire('import.parse.done', { board, diagnostics });
    const { warnings } = await this.importMap(board);
    return {
      warnings: [
        ...diagnostics.map((d) => ({
          message: `Line ${d.line}: ${d.message}`,
          line: d.line,
          source: d.text,
        })),
        ...warnings,
      ],
    };
  }

  /** Current state as the canonical model (from the DI properties). */
  exportMap(): EventStormingBoard {
    return this.get<EventStormingExporter>('eventStormingExporter').export();
  }

  exportDSL(): string {
    return serializeDSL(this.exportMap());
  }

  /** Static, standalone SVG — framed by the content bounds of the free canvas. */
  async saveSVG(): Promise<{ svg: string }> {
    return saveSVG(
      this.get<Canvas>('canvas'),
      this.get<BoardBounds>('boardBounds').contentBounds(),
    );
  }

  /** Own implementation (not a diagram-js primitive): attach the container to `target`. */
  attachTo(target: Element): void {
    target.appendChild(this._container);
    this.get<Canvas>('canvas').resized();
  }

  /** Own implementation: detach the container from the DOM, keeping state. */
  detach(): void {
    this._container.remove();
  }

  clear(): void {
    this._ensureDiagram().clear();
  }

  destroy(): void {
    if (this._diagram) {
      this._diagram.destroy();
      this._diagram = undefined;
    }
    this._container.remove();
  }

  get container(): HTMLElement {
    return this._container;
  }
}
