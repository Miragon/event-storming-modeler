import type { ElementLike } from 'diagram-js/lib/core/Types';
import type CommandHandler from 'diagram-js/lib/command/CommandHandler';

export interface UpdatePropertiesContext {
  element: ElementLike & Record<string, unknown>;
  properties: Record<string, unknown>;
  /** set internally by the handler (for revert). */
  oldProperties?: Record<string, unknown>;
}

function setOrDelete(obj: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) delete obj[key];
  else obj[key] = value;
}

const GEOMETRY_KEYS = ['x', 'y', 'width', 'height'];

/**
 * Geometry changes (e.g. `setStickyKind` resizing the box) move the rectangle the attached
 * arrows are cropped against at render time — the connections must be marked dirty too, or
 * they keep pointing at the old boundary until something else forces a re-render.
 */
function dirtyElements(element: ElementLike, changedKeys: string[]): ElementLike[] {
  if (!changedKeys.some((key) => GEOMETRY_KEYS.includes(key))) return [element];
  const el = element as { incoming?: ElementLike[]; outgoing?: ElementLike[] };
  return [element, ...(el.incoming ?? []), ...(el.outgoing ?? [])];
}

/**
 * Generic, undoable command handler for setting arbitrary Event Storming properties
 * (eventStormingLabel, eventStormingType, color, strokeStyle, ...). Returns the changed element
 * -> CommandStack fires `elements.changed` -> re-render.
 */
export default class UpdatePropertiesHandler implements CommandHandler {
  execute(context: UpdatePropertiesContext): ElementLike[] {
    const { element, properties } = context;
    const target = element as unknown as Record<string, unknown>;
    const old: Record<string, unknown> = {};
    for (const key of Object.keys(properties)) {
      old[key] = target[key];
      setOrDelete(target, key, properties[key]);
    }
    context.oldProperties = old;
    return dirtyElements(element, Object.keys(properties));
  }

  revert(context: UpdatePropertiesContext): ElementLike[] {
    const { element, oldProperties } = context;
    const target = element as unknown as Record<string, unknown>;
    if (oldProperties) {
      for (const key of Object.keys(oldProperties)) setOrDelete(target, key, oldProperties[key]);
    }
    return dirtyElements(element, Object.keys(oldProperties ?? {}));
  }
}
