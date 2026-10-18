import type Canvas from 'diagram-js/lib/core/Canvas';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Create from 'diagram-js/lib/features/create/Create';
import type LassoTool from 'diagram-js/lib/features/lasso-tool/LassoTool';
import type Mouse from 'diagram-js/lib/features/mouse/Mouse';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type { Element } from 'diagram-js/lib/model/Types';
import type EventStormingCopyPaste from '../modeling/EventStormingCopyPaste.js';
import type EventStormingElementFactory from '../model/EventStormingElementFactory.js';
import type EventStormingReadOnly from '../read-only/EventStormingReadOnly.js';
import { STICKY_STYLES } from '../draw/styles.js';
import { isEventStormingConnection, isEventStormingShape } from '../model/di-types.js';

/** Arrow-key nudge in diagram px (Shift = coarse). */
const NUDGE_STEP = 2;
const NUDGE_STEP_COARSE = 10;

const ARROW_DELTAS: Record<string, { x: number; y: number }> = {
  arrowleft: { x: -1, y: 0 },
  arrowright: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  arrowdown: { x: 0, y: 1 },
};

export interface EventStormingKeyboardConfig {
  /**
   * Bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y to the canvas command stack (default true).
   * A host that owns the history (the VS Code document) passes false so the keys reach it.
   */
  undoRedoKeys?: boolean | undefined;
}

/**
 * Minimal keyboard binding: undo/redo, select all, delete, copy/paste/duplicate, arrow-key nudge
 * of the selection, plus the single-key tools E (domain event), C (command) and L (lasso).
 * Deliberately a DOM listener (no diagram-js keyboard-service binding needed). Under the
 * read-only lock only select all, copy and the lasso stay.
 */
export default class EventStormingKeyboard {
  static $inject = [
    'config.eventStormingKeyboard',
    'canvas',
    'commandStack',
    'selection',
    'modeling',
    'eventStormingCopyPaste',
    'eventStormingElementFactory',
    'create',
    'mouse',
    'lassoTool',
    'eventBus',
    'elementRegistry',
    'eventStormingReadOnly',
  ];

  constructor(
    config: EventStormingKeyboardConfig | undefined,
    canvas: Canvas,
    commandStack: CommandStack,
    selection: Selection,
    modeling: Modeling,
    copyPaste: EventStormingCopyPaste,
    factory: EventStormingElementFactory,
    create: Create,
    mouse: Mouse,
    lassoTool: LassoTool,
    eventBus: EventBus,
    elementRegistry?: ElementRegistry,
    readOnly?: Pick<EventStormingReadOnly, 'isReadOnly'>,
  ) {
    const container = canvas.getContainer();
    const undoRedoKeys = config?.undoRedoKeys ?? true;

    // Bind on the DOCUMENT (not the canvas container): single-key tools (E/C/L) must work
    // without the canvas having focus first — same trade-off bpmn-js makes for its keyboard.
    const onKeydown = (e: KeyboardEvent) => {
      // Someone closer to the target (menu, palette, a host's own chrome) already handled it.
      if (e.defaultPrevented) return;
      if (!isCanvasTarget(e.target, container)) return;
      // If the user is currently typing in an input field, do NOT intercept: inline label editing
      // (EventStormingLabelEditing) attaches its <textarea> to the canvas container, and the
      // web-app chrome has its own fields. Without the guard, Backspace/Delete would delete the
      // selected element (instead of a character) and Cmd+Z would reset the diagram.
      if (isEditableTarget(e.target)) return;

      if (handleReadingKey(e)) return;
      if (readOnly?.isReadOnly()) return;
      handleEditingKey(e);
    };

    /** Keys that read the board: select all, copy, lasso. They stay under the read-only lock. */
    const handleReadingKey = (e: KeyboardEvent): boolean => {
      const cmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (cmd && key === 'a' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const all = (elementRegistry?.getAll() ?? []).filter(
          (element) => isEventStormingShape(element) || isEventStormingConnection(element),
        );
        selection.select(all as Element[]);
      } else if (cmd && key === 'c') {
        if (copyPaste.copy()) e.preventDefault();
      } else if (!cmd && !e.altKey && key === 'l') {
        e.preventDefault();
        const lastMove = mouse.getLastMoveEvent();
        lassoTool.activateSelection((lastMove ?? e) as MouseEvent, !!lastMove);
      } else {
        return false;
      }
      return true;
    };

    const handleEditingKey = (e: KeyboardEvent): void => {
      const cmd = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const isUndo = cmd && key === 'z' && !e.shiftKey;
      const isRedo = (cmd && key === 'z' && e.shiftKey) || (cmd && key === 'y');

      if (isUndo || isRedo) {
        if (!undoRedoKeys) return;
        e.preventDefault();
        if (isUndo) commandStack.undo();
        else commandStack.redo();
      } else if (cmd && key === 'v') {
        if (copyPaste.paste()) e.preventDefault();
      } else if (cmd && key === 'd') {
        e.preventDefault();
        copyPaste.duplicate();
      } else if (key === 'delete' || key === 'backspace') {
        const sel = selection.get() as Element[];
        if (sel.length) {
          e.preventDefault();
          modeling.removeElements(sel);
        }
      } else if (!cmd && !e.altKey && (key === 'e' || key === 'c')) {
        // Quick create: the new sticky attaches to the cursor (like palette create).
        const lastMove = mouse.getLastMoveEvent();
        if (lastMove) {
          e.preventDefault();
          const shape =
            key === 'e'
              ? factory.createNew('event', STICKY_STYLES.event.label)
              : factory.createNew('command', STICKY_STYLES.command.label);
          create.start(lastMove, shape as unknown as Element);
        }
      } else if (key in ARROW_DELTAS && !cmd) {
        const sel = selection.get() as Element[];
        if (sel.length) {
          e.preventDefault();
          const step = e.shiftKey ? NUDGE_STEP_COARSE : NUDGE_STEP;
          const d = ARROW_DELTAS[key]!;
          modeling.moveElements(sel, { x: d.x * step, y: d.y * step });
        }
      }
    };

    document.addEventListener('keydown', onKeydown);
    eventBus.on('diagram.destroy', () => document.removeEventListener('keydown', onKeydown));
  }
}

function isCanvasTarget(target: EventTarget | null, container: HTMLElement): boolean {
  if (!(target instanceof Node)) return false;
  // Body/html as target means nothing is focused — the single-key tools must work right away.
  return (
    container.contains(target) || target === document.body || target === document.documentElement
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}
