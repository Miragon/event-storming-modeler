import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
import type EventBus from 'diagram-js/lib/core/EventBus';

/** Fired with `{ readOnly }` whenever the lock changes. */
export const READ_ONLY_CHANGED_EVENT = 'eventStorming.readOnly.changed';

/** Above every edit rule of the renderer and diagram-js, so the lock wins. */
const LOCK_PRIORITY = 5000;

const EDIT_RULES = [
  'elements.move',
  'shape.move',
  'shape.resize',
  'shape.create',
  'elements.create',
  'shape.append',
  'shape.attach',
  'connection.start',
  'connection.create',
  'connection.reconnect',
  'connection.updateWaypoints',
  'elements.delete',
];

/**
 * Locks every edit on the canvas while the document behind it cannot be saved from the canvas
 * (an invalid file in an IDE host, guide §13.5): no move, resize, create, connect or delete
 * through the rules, and the keyboard, context pad, label editor and drawing handles consult
 * `isReadOnly()`. Selection, zoom, pan and export stay.
 */
export default class EventStormingReadOnly extends RuleProvider {
  static override $inject = ['eventBus'];

  private readOnly = false;

  constructor(private readonly bus: EventBus) {
    super(bus);
  }

  override init(): void {
    this.addRule(EDIT_RULES, LOCK_PRIORITY, () => (this.readOnly ? false : undefined));
  }

  isReadOnly(): boolean {
    return this.readOnly;
  }

  setReadOnly(readOnly: boolean): void {
    if (this.readOnly === readOnly) return;
    this.readOnly = readOnly;
    this.bus.fire(READ_ONLY_CHANGED_EVENT, { readOnly });
  }
}
