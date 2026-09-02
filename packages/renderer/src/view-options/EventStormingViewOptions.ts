import type EventBus from 'diagram-js/lib/core/EventBus';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import { isSticky } from '../model/di-types.js';

/** Fired whenever a view preference changes (payload: `{ typeCaptionsVisible }`). */
export const VIEW_OPTIONS_CHANGED_EVENT = 'eventStorming.viewOptions.changed';

/**
 * Per-viewer VIEW preferences — NOT board content: no schema/DSL field, no command-stack
 * entry (toggling is not undoable) and no import/export involvement. Consumers persist a
 * choice themselves (e.g. localStorage) and re-apply it right after creating the viewer.
 */
export default class EventStormingViewOptions {
  static $inject = ['eventBus', 'elementRegistry'];

  /** Captions default to ON — a fresh board explains the sticky color grammar by itself. */
  private _typeCaptionsVisible = true;

  constructor(
    private readonly eventBus: EventBus,
    private readonly elementRegistry: ElementRegistry,
  ) {}

  typeCaptionsVisible(): boolean {
    return this._typeCaptionsVisible;
  }

  setTypeCaptionsVisible(visible: boolean): void {
    if (visible === this._typeCaptionsVisible) return;
    this._typeCaptionsVisible = visible;
    this.eventBus.fire(VIEW_OPTIONS_CHANGED_EVENT, { typeCaptionsVisible: visible });
    // Only stickies carry a caption — mark exactly those changed; the stock change support
    // then clears and redraws each one, and the renderer reads the flag per drawShape.
    const stickies = this.elementRegistry.filter(isSticky);
    if (stickies.length) this.eventBus.fire('elements.changed', { elements: stickies });
  }
}
