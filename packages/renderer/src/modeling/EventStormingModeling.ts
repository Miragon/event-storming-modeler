import type CommandStack from 'diagram-js/lib/command/CommandStack';
import type { DrawingStrokeStyle } from '@miragon/event-storming-schema-model';
import {
  isStickyKind,
  type EventStormingConnection,
  type EventStormingShape,
  type StickyKind,
} from '../model/di-types.js';
import { STICKY_STYLES, noteMetrics } from '../draw/styles.js';
import UpdatePropertiesHandler from './cmd/UpdatePropertiesHandler.js';

const UPDATE_PROPERTIES = 'element.updateProperties';

/**
 * High-level mutations on Event Storming elements that run through the commandStack (undo/redo).
 * Registers the generic UpdatePropertiesHandler at bootstrap.
 */
export default class EventStormingModeling {
  static $inject = ['commandStack'];

  constructor(private readonly commandStack: CommandStack) {
    commandStack.registerHandler(UPDATE_PROPERTIES, UpdatePropertiesHandler);
  }

  updateProperties(
    element: EventStormingShape | EventStormingConnection,
    properties: Record<string, unknown>,
  ): void {
    this.commandStack.execute(UPDATE_PROPERTIES, { element, properties });
  }

  updateLabel(element: EventStormingShape, label: string): void {
    // Notes: resize the box (and thus the move/click hitbox) to the new text, keeping the center.
    if (element.eventStormingType === 'note') {
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
}
