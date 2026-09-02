import Diagram from 'diagram-js/lib/Diagram';
import type { ModuleDeclaration } from 'didi';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { EventStormingBoard } from '@miragon/event-storming-schema-model';
import { parseDSLWithDiagnostics, serializeDSL } from '@miragon/event-storming-dsl';
import { saveSVG } from './io/saveSvg.js';
import type EventStormingImporter from './io/EventStormingImporter.js';
import type EventStormingExporter from './io/EventStormingExporter.js';
import type BoardBounds from './board-bounds/BoardBounds.js';
import type { ImportWarning } from './io/types.js';

export interface EventStormingViewerOptions {
  /** Host element. If missing, a detached <div> is created (can be attached later via attachTo). */
  container?: HTMLElement;
  width?: number | string;
  height?: number | string;
  /** Concatenated to the end of the module list (extension point). */
  additionalModules?: ModuleDeclaration[];
}

export type EventCallback<T = unknown> = (event: T) => void;

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
      this._diagram = new Diagram({ canvas: { container: this._container }, modules });
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
    importer.clear();
    const warnings = importer.import(board);
    this._applyStyleClass(board.config.style);
    // Discard the PREVIOUS board's undo history: undo on orphaned elements would otherwise
    // crash or insert zombie elements into the new board.
    diagram.get<CommandStack>('commandStack').clear();
    eventBus.fire('import.done', { warnings });
    return { warnings };
  }

  /** DSL `style` directive as a CSS class on the container (`event-storming-dark` etc.). */
  private _applyStyleClass(style?: string): void {
    const cls = this._container.classList;
    for (const s of ['classic', 'dark']) cls.remove(`event-storming-${s}`);
    if (style && style !== 'classic') cls.add(`event-storming-${style}`);
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
        ...diagnostics.map((d) => ({ message: `Line ${d.line}: ${d.message} — "${d.text}"` })),
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
  attachTo(target: HTMLElement): void {
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
