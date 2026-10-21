import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import {
  isEventStormingConnection,
  isEventStormingShape,
  type EventStormingConnection,
  type EventStormingShape,
} from '../model/di-types.js';
import type EventStormingModeling from '../modeling/EventStormingModeling.js';
import { READ_ONLY_CHANGED_EVENT, type EventStormingReadOnly } from '../read-only/index.js';
import { isManualNoteBox, noteMetrics } from '../draw/styles.js';
import {
  NOTE_BULLET_CLASS,
  HORIZONTAL_CYCLE,
  VERTICAL_CYCLE,
  applyAlignPreview,
  createNoteToolbar,
  domToNoteMarkdown,
  insertPlainText,
  nextInCycle,
  noteMarkdownToDom,
  selectAllContent,
  selectedLineDivs,
  toggleBulletLines,
  updateAlignButton,
  type NoteAlignState,
  type NoteToolbarAction,
} from './note-editor-dom.js';

interface ActiveEdit {
  field: HTMLElement;
  /** Puts the field over its element again, for the current zoom and scroll. */
  place: () => void;
  /** Saves the current value and closes (for Enter, blur, click outside). */
  commit: () => void;
  /** Discards and closes (only for Escape). */
  cleanup: () => void;
  /** What was typed so far, to reopen the same edit after an import. */
  snapshot: () => SuspendedEdit;
}

/** An open edit taken down for an import: the element it belongs to and the uncommitted text. */
interface SuspendedEdit {
  elementId: string;
  connection: boolean;
  /** The field's raw value (the note editor's markdown), not yet sanitized. */
  value: string;
  selectionStart?: number | undefined;
  selectionEnd?: number | undefined;
  align?: NoteAlignState | undefined;
}

/**
 * Defuses DSL metacharacters in labels: in the `.storm` DSL, names double as references —
 * `->`, `;`, square brackets and comment starters would corrupt arrow/coordinate lines on
 * re-import. The comment defusing mirrors the DSL serializer's `escapeText` exactly (division
 * slash U+2215, `://` URLs exempt), so what the user sees on canvas is byte-identical to what a
 * save/reload produces. Newlines stay: the DSL escapes them (`\n`) for stickies and notes alike.
 */
export function sanitizeLabel(raw: string): string {
  return raw
    .replace(/(?<!:)\/\//g, '∕∕') // // starts a line comment (URL `://` stays intact)
    .replace(/\/\*/g, '∕*') // /* starts a block comment
    .replace(/->/g, '→') // -> would be the arrow operator
    .replace(/;/g, ',') // ; separates arrow annotations
    .replace(/\[/g, '(') // [..] would be a coordinate tuple
    .replace(/\]/g, ')')
    .trim();
}

/**
 * Custom inline label editing as an HTML overlay (deliberately not diagram-js direct-editing).
 * Commit goes through `eventStormingModeling` -> commandStack (undo). Sticky text is
 * multi-line, so stickies are edited in a `<textarea>` (Enter = line break, Cmd/Ctrl+Enter or
 * click outside = save); connection labels use a single-line `<input>` (Enter = save). NOTES
 * get the WYSIWYG contenteditable overlay instead (see `activateNote`) — same commit/cancel
 * semantics, plus live bold/italic/bullet formatting and the floating alignment toolbar.
 */
export default class EventStormingLabelEditing {
  static $inject = [
    'eventBus',
    'canvas',
    'eventStormingModeling',
    'elementRegistry',
    'eventStormingReadOnly',
  ];

  private active: ActiveEdit | null = null;
  private suspended: SuspendedEdit | null = null;
  private resumeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    eventBus: EventBus,
    private readonly canvas: Canvas,
    private readonly modeling: EventStormingModeling,
    private readonly elementRegistry?: ElementRegistry,
    private readonly readOnly?: Pick<EventStormingReadOnly, 'isReadOnly'>,
  ) {
    eventBus.on(READ_ONLY_CHANGED_EVENT, (event: { readOnly?: boolean }) => {
      if (event.readOnly) this.cancel();
    });
    // Before the canvas tears down (priority 500): a field still open would blur when the
    // container leaves the document, commit onto the destroyed diagram and queue a canvas focus.
    eventBus.on('diagram.destroy', () => {
      clearTimeout(this.resumeTimer);
      this.suspended = null;
      this.cancel();
    });
    eventBus.on('element.dblclick', (event: { element?: unknown }) => {
      if (isEventStormingShape(event.element)) this.activate(event.element);
      else if (isEventStormingConnection(event.element)) this.activateConnection(event.element);
    });
    // Click/drag outside the field = SAVE (not discard). Only Escape discards.
    eventBus.on(['element.mousedown', 'drag.init'], () => this.active?.commit());
    // A view change is no edit gesture: a host fits or restores its view while the user types
    // (modeler-api L5), and scroll and zoom move the board under the field. Committing there would
    // write half-typed text, so the field follows its element instead.
    eventBus.on('canvas.viewbox.changed', () => this.active?.place());
  }

  /**
   * Takes an open edit down WITHOUT committing it, for an import that replaces the board: its
   * element is about to be removed, so a commit (a blur or a click once the board is replaced)
   * would land on a detached shape and be wiped with the history. Hosts re-import remote states
   * while the user types; `resumeAfterImport` brings the editor back with the typed text.
   */
  suspend(): void {
    clearTimeout(this.resumeTimer);
    if (!this.active) return;
    this.suspended = this.active.snapshot();
    this.active.cleanup();
  }

  /**
   * Reopens a suspended edit on the element with the same id, if the imported board still has
   * it. Deferred to the next task, after the host has restored its viewbox around the import, so
   * the field opens where the element ends up.
   */
  resumeAfterImport(): void {
    clearTimeout(this.resumeTimer);
    if (!this.suspended) return;
    this.resumeTimer = setTimeout(() => {
      const edit = this.suspended;
      this.suspended = null;
      if (edit && !this.active) this.resume(edit);
    }, 0);
  }

  private resume(edit: SuspendedEdit): void {
    const element = this.elementRegistry?.get(edit.elementId);
    if (edit.connection) {
      if (!isEventStormingConnection(element)) return;
      this.activateConnection(element);
    } else {
      if (!isEventStormingShape(element)) return;
      this.activate(element);
    }
    const field = this.active?.field;
    if (!field) return;
    if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
      field.value = edit.value;
      if (field instanceof HTMLTextAreaElement) {
        field.rows = Math.max(2, edit.value.split('\n').length);
      }
      field.setSelectionRange(
        edit.selectionStart ?? edit.value.length,
        edit.selectionEnd ?? edit.value.length,
      );
    } else {
      noteMarkdownToDom(field, edit.value);
      if (edit.align) this.restoreNoteAlign?.(edit.align);
      placeCaretAtEnd(field);
    }
  }

  private restoreNoteAlign: ((align: NoteAlignState) => void) | undefined;

  activate(element: EventStormingShape): void {
    this.active?.commit();
    if (this.readOnly?.isReadOnly()) return;
    if (element.eventStormingType === 'drawing') return; // pure geometry, no label
    if (element.eventStormingType === 'note') {
      this.activateNote(element);
      return;
    }

    const container = this.canvas.getContainer();
    const field = document.createElement('textarea');
    field.className = 'event-storming-label-input event-storming-label-textarea';
    field.value = element.eventStormingLabel ?? '';
    field.rows = Math.max(2, field.value.split('\n').length);
    field.wrap = 'off';
    field.style.position = 'absolute';
    field.style.transform = 'translate(-50%, -50%)';
    // Overlay the editor centered ON the sticky (the text lives inside it — WYSIWYG); this also
    // keeps the field visible for stickies at the viewport edge.
    const place = () => {
      const scale = this.canvas.zoom();
      const vb = this.canvas.viewbox();
      field.style.left = `${(element.x + element.width / 2 - vb.x) * scale}px`;
      field.style.top = `${(element.y + element.height / 2 - vb.y) * scale}px`;
      field.style.width = `${element.width * scale}px`;
    };
    place();
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
      this.canvas.restoreFocus?.();
    };
    const commit = () => {
      if (done) return;
      // Enforce metacharacter protection also on RENAME — the DSL references elements by their
      // name; unescaped `->`, `;` or brackets would corrupt arrow/coordinate lines on re-import.
      const value = sanitizeLabel(field.value);
      const changed = value && value !== element.eventStormingLabel;
      cleanup();
      if (!changed) return;
      // Renaming to an EXISTING label is allowed — duplicate labels are legal, the DSL
      // disambiguates via `(id …)` suffixes and `#id` references.
      this.modeling.updateLabel(element, value);
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

    const snapshot = (): SuspendedEdit => ({
      elementId: element.id,
      connection: false,
      value: field.value,
      selectionStart: field.selectionStart ?? undefined,
      selectionEnd: field.selectionEnd ?? undefined,
    });
    this.active = { field, place, commit, cleanup, snapshot };
  }

  /**
   * WYSIWYG editing for notes: a contenteditable overlay rendering the markdown subset live
   * (bold/italic/bullets) plus the floating format/alignment toolbar. Commit/cancel semantics
   * are identical to the textarea path (click outside / Cmd-Ctrl+Enter save, Escape discards,
   * plain Enter breaks the line); the committed value is the canonical markdown string run
   * through the same `sanitizeLabel`, and label + alignment land in ONE updateProperties.
   */
  private activateNote(element: EventStormingShape): void {
    const container = this.canvas.getContainer();
    const editor = document.createElement('div');
    editor.className = 'event-storming-label-input event-storming-note-editor';
    editor.contentEditable = 'true';
    editor.style.position = 'absolute';
    editor.style.transform = 'translate(-50%, -50%)';
    noteMarkdownToDom(editor, element.eventStormingLabel ?? '');

    const align: NoteAlignState = {
      horizontal: element.alignHorizontal ?? 'left',
      vertical: element.alignVertical ?? 'top',
    };
    applyAlignPreview(editor, align);

    const toolbar = createNoteToolbar(document, (action) => onAction(action));
    toolbar.style.transform = 'translate(-50%, -100%)';
    const place = () => {
      const scale = this.canvas.zoom();
      const vb = this.canvas.viewbox();
      const left = (element.x + element.width / 2 - vb.x) * scale;
      editor.style.left = `${left}px`;
      editor.style.top = `${(element.y + element.height / 2 - vb.y) * scale}px`;
      // min- (not fixed) box: the editor covers the note's footprint but grows with new lines.
      editor.style.minWidth = `${element.width * scale}px`;
      editor.style.minHeight = `${element.height * scale}px`;
      // Floats just above the note's top edge, x-centered like the editor.
      toolbar.style.left = `${left}px`;
      toolbar.style.top = `${(element.y - vb.y) * scale - 8}px`;
    };
    place();

    container.appendChild(editor);
    container.appendChild(toolbar);
    editor.focus();
    selectAllContent(editor);

    const buttonOf = (action: NoteToolbarAction) =>
      toolbar.querySelector<HTMLElement>(`[data-action="${action}"]`);
    const setActive = (action: NoteToolbarAction, on: boolean) => {
      const button = buttonOf(action);
      button?.classList.toggle('active', on);
      button?.setAttribute('aria-pressed', String(on));
    };
    const refreshToolbar = () => {
      setActive('note-bold', queryCommandState('bold'));
      setActive('note-italic', queryCommandState('italic'));
      const lines = selectedLineDivs(editor);
      setActive(
        'note-bullet',
        lines.length > 0 && lines.every((line) => line.classList.contains(NOTE_BULLET_CLASS)),
      );
      const horizontal = buttonOf('note-align-horizontal');
      if (horizontal) updateAlignButton(horizontal, 'horizontal', align.horizontal);
      const vertical = buttonOf('note-align-vertical');
      if (vertical) updateAlignButton(vertical, 'vertical', align.vertical);
    };
    const exec = (command: 'bold' | 'italic') => {
      // Deprecated but still the only dependency-free selection-formatting primitive for
      // contenteditable; absent in jsdom, hence the guard.
      if (typeof document.execCommand === 'function') document.execCommand(command, false);
      refreshToolbar();
    };
    const cycle = (axis: 'horizontal' | 'vertical') => {
      if (axis === 'horizontal') align.horizontal = nextInCycle(HORIZONTAL_CYCLE, align.horizontal);
      else align.vertical = nextInCycle(VERTICAL_CYCLE, align.vertical);
      applyAlignPreview(editor, align);
      refreshToolbar();
    };
    const onAction = (action: NoteToolbarAction) => {
      if (action === 'note-bold') exec('bold');
      else if (action === 'note-italic') exec('italic');
      else if (action === 'note-bullet') {
        toggleBulletLines(editor);
        refreshToolbar();
      } else cycle(action === 'note-align-horizontal' ? 'horizontal' : 'vertical');
    };
    // Bold/italic active states follow the caret, not just toolbar clicks.
    const onSelectionChange = () => refreshToolbar();
    document.addEventListener('selectionchange', onSelectionChange);

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      document.removeEventListener('selectionchange', onSelectionChange);
      editor.removeEventListener('keydown', onKey as EventListener);
      editor.removeEventListener('blur', onBlur as EventListener);
      editor.removeEventListener('paste', onPaste as EventListener);
      editor.remove();
      toolbar.remove();
      this.active = null;
      this.restoreNoteAlign = undefined;
      this.canvas.restoreFocus?.();
    };
    const commit = () => {
      if (done) return;
      // Same metacharacter defusing as the textarea path, applied to the COMMITTED markdown.
      const value = sanitizeLabel(domToNoteMarkdown(editor));
      const properties = noteCommitProperties(element, value, align);
      cleanup();
      if (properties) this.modeling.updateProperties(element, properties);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        return;
      }
      if (e.key === 'Enter') {
        // Save only with Cmd/Ctrl -> plain Enter inserts a line break (notes are multi-line).
        if (!(e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        commit();
        return;
      }
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && (key === 'b' || key === 'i')) {
        e.preventDefault();
        exec(key === 'b' ? 'bold' : 'italic');
      }
    };
    const onBlur = (e: FocusEvent) => {
      // Focus moving INTO the toolbar is not "outside" (its mousedown is prevented, but be
      // safe for keyboard focus and engines that blur anyway).
      if (e.relatedTarget instanceof Node && toolbar.contains(e.relatedTarget)) return;
      commit();
    };
    const onPaste = (e: ClipboardEvent) => {
      // PLAIN text only — foreign HTML must never enter the DOM the commit reads back.
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text) insertPlainText(editor, text);
    };
    editor.addEventListener('keydown', onKey as EventListener);
    editor.addEventListener('blur', onBlur as EventListener);
    editor.addEventListener('paste', onPaste as EventListener);

    refreshToolbar();
    this.restoreNoteAlign = (restored) => {
      align.horizontal = restored.horizontal;
      align.vertical = restored.vertical;
      applyAlignPreview(editor, align);
      refreshToolbar();
    };
    const snapshot = (): SuspendedEdit => ({
      elementId: element.id,
      connection: false,
      value: domToNoteMarkdown(editor),
      align: { ...align },
    });
    this.active = { field: editor, place, commit, cleanup, snapshot };
  }

  /**
   * Inline editing for connections: the arrow's `; annotation` text. An empty input clears the
   * field. Undo-safe via updateProperties.
   */
  activateConnection(conn: EventStormingConnection): void {
    this.active?.commit();
    if (this.readOnly?.isReadOnly()) return;

    const container = this.canvas.getContainer();
    const first = conn.waypoints[0];
    const last = conn.waypoints[conn.waypoints.length - 1];
    if (!first || !last) return;

    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'event-storming-label-input';
    field.placeholder = 'arrow label';
    field.value = conn.linkLabel ?? '';
    field.style.position = 'absolute';
    const place = () => {
      const scale = this.canvas.zoom();
      const vb = this.canvas.viewbox();
      field.style.left = `${((first.x + last.x) / 2 - 60 - vb.x) * scale}px`;
      field.style.top = `${((first.y + last.y) / 2 - 26 - vb.y) * scale}px`;
    };
    place();
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
      this.canvas.restoreFocus?.();
    };
    const commit = () => {
      if (done) return;
      // Same metacharacter protection as sticky labels: an unescaped `[..]` tuple in the
      // serialized arrow line would be misread as a declaration, silently losing the edge.
      const value = sanitizeLabel(field.value);
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

    const snapshot = (): SuspendedEdit => ({
      elementId: conn.id,
      connection: true,
      value: field.value,
      selectionStart: field.selectionStart ?? undefined,
      selectionEnd: field.selectionEnd ?? undefined,
    });
    this.active = { field, place, commit, cleanup, snapshot };
  }

  cancel(): void {
    this.active?.cleanup();
  }

  /** The edit open right now (its element and the uncommitted text), for hosts and tests. */
  openEdit(): { elementId: string; value: string } | undefined {
    if (!this.active) return undefined;
    const { elementId, value } = this.active.snapshot();
    return { elementId, value };
  }
}

/**
 * Everything a note commit changes, as ONE updateProperties payload — label, (for auto-sized
 * boxes) the recentered metrics box, and the align DI props: a single command, a single undo
 * step. Returns null when nothing changed. The auto-resize mirrors
 * `EventStormingModeling.updateLabel`'s manual-vs-auto rule; it is inlined here because the
 * alignment must land in the SAME command as the label.
 */
function noteCommitProperties(
  element: EventStormingShape,
  value: string,
  align: NoteAlignState,
): Record<string, unknown> | null {
  const labelChanged = !!value && value !== element.eventStormingLabel;
  const alignChanged =
    align.horizontal !== (element.alignHorizontal ?? 'left') ||
    align.vertical !== (element.alignVertical ?? 'top');
  if (!labelChanged && !alignChanged) return null;
  const properties: Record<string, unknown> = {};
  if (labelChanged) {
    properties.eventStormingLabel = value;
    if (!isManualNoteBox(element.eventStormingLabel, element)) {
      const { width, height } = noteMetrics(value);
      properties.width = width;
      properties.height = height;
      properties.x = element.x + element.width / 2 - width / 2;
      properties.y = element.y + element.height / 2 - height / 2;
    }
  }
  if (alignChanged) {
    // Default axes collapse to ABSENT DI props (undefined deletes) — the exporter/factory
    // contract that keeps unaligned boards serializing byte-identically.
    properties.alignHorizontal = align.horizontal === 'left' ? undefined : align.horizontal;
    properties.alignVertical = align.vertical === 'top' ? undefined : align.vertical;
  }
  return properties;
}

function placeCaretAtEnd(field: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(field);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Bold/italic state at the caret — absent in jsdom (the button simply never shows active). */
function queryCommandState(command: string): boolean {
  if (typeof document.queryCommandState !== 'function') return false;
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}
