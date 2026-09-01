import type Canvas from 'diagram-js/lib/core/Canvas';
import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type { Root } from 'diagram-js/lib/model/Types';
import {
  DEFAULT_BOARD_LEVEL,
  type BoardLevel,
  type DrawingStrokeStyle,
} from '@miragon/event-storming-schema-model';
import {
  isStickyKind,
  ROOT_ID,
  type EventStormingConnection,
  type EventStormingShape,
  type StickyKind,
} from '../model/di-types.js';
import type { RootBusinessObject } from '../io/types.js';
import { STICKY_STYLES, isManualNoteBox, noteMetrics } from '../draw/styles.js';
import UpdatePropertiesHandler from './cmd/UpdatePropertiesHandler.js';

const UPDATE_PROPERTIES = 'element.updateProperties';

/**
 * High-level mutations on Event Storming elements that run through the commandStack (undo/redo).
 * Registers the generic UpdatePropertiesHandler at bootstrap.
 */
export default class EventStormingModeling {
  static $inject = ['commandStack', 'canvas', 'elementRegistry'];

  constructor(
    private readonly commandStack: CommandStack,
    private readonly canvas: Canvas,
    private readonly elementRegistry: ElementRegistry,
  ) {
    commandStack.registerHandler(UPDATE_PROPERTIES, UpdatePropertiesHandler);
  }

  updateProperties(
    element: EventStormingShape | EventStormingConnection,
    properties: Record<string, unknown>,
  ): void {
    this.commandStack.execute(UPDATE_PROPERTIES, { element, properties });
  }

  updateLabel(element: EventStormingShape, label: string): void {
    // AUTO-sized notes: resize the box (and thus the move/click hitbox) to the new text, keeping
    // the center. A MANUAL box (differs from the text metrics) was the user's choice — keep it,
    // the text reflows/clips inside.
    if (
      element.eventStormingType === 'note' &&
      !isManualNoteBox(element.eventStormingLabel, element)
    ) {
      const { width, height } = noteMetrics(label);
      const cx = element.x + element.width / 2;
      const cy = element.y + element.height / 2;
      this.updateProperties(element, {
        eventStormingLabel: label,
        width,
        height,
        x: cx - width / 2,
        y: cy - height / 2,
      });
      return;
    }
    this.updateProperties(element, { eventStormingLabel: label });
  }

  /**
   * Retypes a sticky among the eight sticky kinds, keeping id/label/position/color. The box is
   * resized to the new kind's size around the current center; the changed element re-renders.
   */
  setStickyKind(element: EventStormingShape, elementType: StickyKind): void {
    if (!isStickyKind(element.eventStormingType) || !isStickyKind(elementType)) {
      throw new Error(`setStickyKind: only sticky kinds can be retyped`);
    }
    if (element.eventStormingType === elementType) return;
    const { width, height } = STICKY_STYLES[elementType];
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    this.updateProperties(element, {
      eventStormingType: elementType,
      width,
      height,
      x: cx - width / 2,
      y: cy - height / 2,
    });
  }

  /** Sets the element color (CSS color/hex) or removes it (`undefined` = the kind's default). */
  setColor(element: EventStormingShape, color: string | undefined): void {
    this.updateProperties(element, { color });
  }

  /** Sets a drawing's stroke style (`undefined` = solid). */
  setStrokeStyle(element: EventStormingShape, strokeStyle: DrawingStrokeStyle | undefined): void {
    this.updateProperties(element, { strokeStyle });
  }

  /**
   * Current effective workshop level (root `config.level`; absent means design). Reads via the
   * element registry — NOT `canvas.getRootElement()`, which would CREATE an implicit root as a
   * side effect (the palette asks for the level at bootstrap, before any board is imported, and
   * a stale implicit root crashes the importer's root swap after `clear()`).
   */
  getLevel(): BoardLevel {
    const root = this.elementRegistry.get(ROOT_ID) as
      (Root & { businessObject?: RootBusinessObject }) | undefined;
    return root?.businessObject?.config.level ?? DEFAULT_BOARD_LEVEL;
  }

  /**
   * Sets the workshop level on the root config — undoable like any element mutation. The
   * businessObject is replaced as a whole (not mutated) so the generic property handler can
   * snapshot/restore it and the exporter picks the change up from the root config.
   */
  setLevel(level: BoardLevel): void {
    if (this.getLevel() === level) return;
    const root = this.root();
    const meta = root.businessObject ?? { config: { title: 'Untitled Board' } };
    this.commandStack.execute(UPDATE_PROPERTIES, {
      element: root,
      properties: { businessObject: { ...meta, config: { ...meta.config, level } } },
    });
  }

  private root(): Root & { businessObject?: RootBusinessObject } {
    return (this.elementRegistry.get(ROOT_ID) ?? this.canvas.getRootElement()) as Root & {
      businessObject?: RootBusinessObject;
    };
  }
}
