import type PopupMenu from 'diagram-js/lib/features/popup-menu/PopupMenu';
import type { PopupMenuTarget } from 'diagram-js/lib/features/popup-menu/PopupMenu';
import type {
  PopupMenuEntries,
  default as PopupMenuProvider,
} from 'diagram-js/lib/features/popup-menu/PopupMenuProvider';
import { LEVEL_STICKY_KINDS } from '@miragon/event-storming-schema-model';
import {
  STICKY_KINDS,
  isSticky,
  type EventStormingShape,
  type StickyKind,
} from '../model/di-types.js';
import { STICKY_STYLES } from '../draw/styles.js';
import { kindSquare } from '../draw/palette-icons.js';
import type EventStormingModeling from '../modeling/EventStormingModeling.js';

export const POPUP_PROVIDER_ID = 'event-storming-element-settings';

const KIND_GROUP = { id: 'kind', name: 'Change type' };

function mark(active: boolean, label: string): string {
  return active ? `✓ ${label}` : label;
}

/**
 * Popup submenu (opened via the context pad) for retyping a sticky among the eight kinds —
 * colored-square icon per kind, checkmark on the current one. All actions go through
 * `eventStormingModeling.setStickyKind` (undo/redo).
 */
export default class EventStormingElementSettingsProvider implements PopupMenuProvider {
  static $inject = ['popupMenu', 'eventStormingModeling'];

  constructor(
    popupMenu: PopupMenu,
    private readonly modeling: EventStormingModeling,
  ) {
    popupMenu.registerProvider(POPUP_PROVIDER_ID, this);
  }

  getPopupMenuEntries(target: PopupMenuTarget): PopupMenuEntries {
    const shape = (Array.isArray(target) ? target[0] : target) as EventStormingShape | undefined;
    if (!isSticky(shape)) return {};
    return this.kindEntries(shape);
  }

  private kindEntries(shape: EventStormingShape): PopupMenuEntries {
    const entries: PopupMenuEntries = {};
    // The workshop level filters the offered kinds; the element's CURRENT kind always shows,
    // so an out-of-level sticky (levels are not validation) still displays its type checked.
    const allowed = LEVEL_STICKY_KINDS[this.modeling.getLevel()];
    for (const kind of STICKY_KINDS) {
      if (!allowed.includes(kind) && kind !== shape.eventStormingType) continue;
      const style = STICKY_STYLES[kind];
      entries[`kind-${kind}`] = {
        label: mark(shape.eventStormingType === kind, style.label),
        imageHtml: kindSquare(style.fill, style.stroke),
        group: KIND_GROUP,
        action: () => this.modeling.setStickyKind(shape, kind as StickyKind),
      };
    }
    return entries;
  }
}
