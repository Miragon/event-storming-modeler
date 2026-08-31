import type Canvas from 'diagram-js/lib/core/Canvas';
import type EventBus from 'diagram-js/lib/core/EventBus';
import {
  isEventStormingConnection,
  isEventStormingShape,
  type EventStormingConnection,
  type EventStormingShape,
} from '../model/di-types.js';
import type EventStormingModeling from '../modeling/EventStormingModeling.js';
import type EventStormingElementFactory from '../model/EventStormingElementFactory.js';

interface ActiveEdit {
  field: HTMLInputElement | HTMLTextAreaElement;
  /** Saves the current value and closes (for Enter, blur, click outside). */
  commit: () => void;
  /** Discards and closes (only for Escape). */
  cleanup: () => void;
}

/**
 * Defuses DSL metacharacters in labels: in the `.storm` DSL, names double as references —
 * `->`, `;` and square brackets would corrupt arrow/coordinate lines on re-import.
 */
function sanitizeLabel(raw: string): string {
  return raw
    .replace(/->/g, '→') // -> would be the arrow operator
    .replace(/;/g, ',') // ; separates arrow annotations
    .replace(/\[/g, '(') // [..] would be a coordinate tuple
    .replace(/\]/g, ')')
    .trim();
}

/**
 * Custom inline label editing as an HTML overlay (deliberately not diagram-js direct-editing).
 * Commit goes through `eventStormingModeling.updateLabel` -> commandStack (undo). Sticky text is
 * multi-line, so every shape is edited in a `<textarea>` (Enter = line break, Cmd/Ctrl+Enter or
 * click outside = save); connection labels use a single-line `<input>` (Enter = save).
 */
export default class EventStormingLabelEditing {
  static $inject = ['eventBus', 'canvas', 'eventStormingModeling', 'eventStormingElementFactory'];

  private active: ActiveEdit | null = null;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly modeling: EventStormingModeling,
    private readonly factory: EventStormingElementFactory,
  ) {
    eventBus.on('element.dblclick', (event: { element?: unknown }) => {
      if (isEventStormingShape(event.element)) this.activate(event.element);
      else if (isEventStormingConnection(event.element)) this.activateConnection(event.element);
    });
    // Click/drag/pan outside the field = SAVE (not discard). Only Escape discards.
    eventBus.on(['element.mousedown', 'drag.init', 'canvas.viewbox.changing'], () =>
      this.active?.commit(),
    );
  }

  activate(element: EventStormingShape): void {
    this.active?.commit();
    if (element.eventStormingType === 'drawing') return; // pure geometry, no label

    const container = this.canvas.getContainer();
    const scale = this.canvas.zoom();
    const vb = this.canvas.viewbox();
    const isNote = element.eventStormingType === 'note';
    const left = (element.x + element.width + 6 - vb.x) * scale;
    const top = (element.y + element.height / 2 - 11 - vb.y) * scale;

    const field = document.createElement('textarea');
    field.className = 'event-storming-label-input event-storming-label-textarea';
    field.value = element.eventStormingLabel ?? '';
    field.rows = Math.max(2, field.value.split('\n').length);
    field.wrap = 'off';
    field.style.position = 'absolute';
    field.style.left = `${left}px`;
    field.style.top = `${top}px`;
    container.appendChild(field);
    field.focus();
    field.select();

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      field.removeEventListener('keydown', onKey as EventListener);
      field.removeEventListener('blur', onBlur);
      field.remove();
      this.active = null;
    };
    const commit = () => {
      if (done) return;
      // Enforce metacharacter protection also on RENAME — the DSL references elements by their
      // name; unescaped `->`, `;` or brackets would corrupt arrow/coordinate lines on re-import.
      const value = sanitizeLabel(field.value);
      const changed = value && value !== element.eventStormingLabel;
      cleanup();
      if (!changed) return;
      // Enforce uniqueness only for linkable stickies (duplicate names would collapse stickies
      // on the DSL round-trip -> arrows disappear). Notes are never edge endpoints and may
      // therefore repeat (e.g. several "Risk" hints).
      const finalLabel = isNote ? value : this.factory.uniqueLabel(value, element.id);
      this.modeling.updateLabel(element, finalLabel);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        return;
      }
      if (e.key === 'Enter') {
        // Save only with Cmd/Ctrl -> plain Enter inserts a line break (sticky text is multi-line).
        if (!(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        commit();
      }
    };
    const onBlur = () => commit();
    field.addEventListener('keydown', onKey as EventListener);
    field.addEventListener('blur', onBlur);

    this.active = { field, commit, cleanup };
  }

  /**
   * Inline editing for connections: the arrow's `; annotation` text. An empty input clears the
   * field. Undo-safe via updateProperties.
   */
  activateConnection(conn: EventStormingConnection): void {
    this.active?.commit();

    const container = this.canvas.getContainer();
    const scale = this.canvas.zoom();
    const vb = this.canvas.viewbox();
    const first = conn.waypoints[0];
    const last = conn.waypoints[conn.waypoints.length - 1];
    if (!first || !last) return;

    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'event-storming-label-input';
    field.placeholder = 'arrow label';
    field.value = conn.linkLabel ?? '';
    field.style.position = 'absolute';
    field.style.left = `${((first.x + last.x) / 2 - 60 - vb.x) * scale}px`;
    field.style.top = `${((first.y + last.y) / 2 - 26 - vb.y) * scale}px`;
    container.appendChild(field);
    field.focus();
    field.select();

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      field.removeEventListener('keydown', onKey as EventListener);
      field.removeEventListener('blur', onBlur);
      field.remove();
      this.active = null;
    };
    const commit = () => {
      if (done) return;
      // Defuse DSL metacharacters: `;` starts the annotation, `->` is the arrow operator.
      const value = field.value.replace(/;/g, ',').replace(/->/g, '→').trim();
      const current = conn.linkLabel ?? '';
      cleanup();
      if (value === current) return;
      this.modeling.updateProperties(conn, { linkLabel: value || undefined });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    };
    const onBlur = () => commit();
    field.addEventListener('keydown', onKey as EventListener);
    field.addEventListener('blur', onBlur);

    this.active = { field, commit, cleanup };
  }

  cancel(): void {
    this.active?.cleanup();
  }
}
