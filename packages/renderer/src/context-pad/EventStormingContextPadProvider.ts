import type ContextPad from 'diagram-js/lib/features/context-pad/ContextPad';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Connect from 'diagram-js/lib/features/connect/Connect';
import type Create from 'diagram-js/lib/features/create/Create';
import type PopupMenu from 'diagram-js/lib/features/popup-menu/PopupMenu';
import type {
  ContextPadEntries,
  default as ContextPadProvider,
} from 'diagram-js/lib/features/context-pad/ContextPadProvider';
import type { Element } from 'diagram-js/lib/model/Types';
import {
  isEventStormingShape,
  isEventStormingConnection,
  isStickyKind,
  type EventStormingShape,
} from '../model/di-types.js';
import type EventStormingModeling from '../modeling/EventStormingModeling.js';
import type EventStormingLabelEditing from '../label-editing/EventStormingLabelEditing.js';
import type EventStormingElementFactory from '../model/EventStormingElementFactory.js';
import type EventStormingColorPicker from '../color-picker/EventStormingColorPicker.js';
import { POPUP_PROVIDER_ID } from '../popup/index.js';
import {
  iconMarkup,
  ICON_ADD,
  ICON_ARROW_FORWARD,
  ICON_AUTORENEW,
  ICON_DELETE,
  ICON_EDIT,
  ICON_PALETTE,
  ICON_SWAP_HORIZ,
} from '../draw/icons.js';

/** Title of the single append entry — the kind is chosen in the popup, not in the pad. */
const APPEND_TITLE = 'Append sticky (auto-connect, choose the type after placing)';

/**
 * ContextPad entry as HTML with a Material icon. `draggable=true` is mandatory for entries with a
 * `dragstart` action — otherwise diagram-js does not fire the drag.
 */
function cpHtml(icon: string, title: string, draggable = false): string {
  return `<div class="entry event-storming-cp-entry"${draggable ? ' draggable="true"' : ''} title="${title}">${iconMarkup(icon)}</div>`;
}

/** Context actions per element. */
export default class EventStormingContextPadProvider implements ContextPadProvider {
  static $inject = [
    'contextPad',
    'modeling',
    'connect',
    'create',
    'popupMenu',
    'eventStormingModeling',
    'eventStormingLabelEditing',
    'eventStormingElementFactory',
    'eventStormingColorPicker',
  ];

  constructor(
    contextPad: ContextPad,
    private readonly modeling: Modeling,
    private readonly connect: Connect,
    private readonly create: Create,
    private readonly popupMenu: PopupMenu,
    private readonly eventStormingModeling: EventStormingModeling,
    private readonly labelEditing: EventStormingLabelEditing,
    private readonly factory: EventStormingElementFactory,
    private readonly colorPicker: EventStormingColorPicker,
  ) {
    contextPad.registerProvider(this);
  }

  getContextPadEntries(element: Element): ContextPadEntries {
    // Connections: edit the arrow annotation + delete.
    if (isEventStormingConnection(element)) {
      const conn = element;
      return {
        'edit-label': {
          group: 'edit',
          title: 'Edit arrow label',
          html: cpHtml(ICON_EDIT, 'Edit arrow label'),
          action: { click: () => this.labelEditing.activateConnection(conn) },
        },
        delete: {
          group: 'edit',
          title: 'Delete connection',
          html: cpHtml(ICON_DELETE, 'Delete connection'),
          action: { click: () => this.modeling.removeElements([element]) },
        },
      };
    }
    if (!isEventStormingShape(element)) return {};
    const shape = element as EventStormingShape;
    const entries: ContextPadEntries = {};
    const kind = shape.eventStormingType;

    if (isStickyKind(kind)) {
      // Append: drags out a BLANK sticky and creates the arrow automatically (diagram-js Create
      // with `source` -> modeling.appendShape). The kind is chosen in the change-type popup that
      // opens on placement (see EventStormingAppendBehavior), so ONE entry suffices and it is
      // available on every workshop level — the popup applies the level filter.
      const startAppend = (event: Event) => {
        const next = this.factory.createProvisional();
        this.create.start(event as MouseEvent, next as unknown as Element, {
          source: shape as unknown as Element,
        });
      };
      entries['append'] = {
        group: 'append',
        title: APPEND_TITLE,
        html: cpHtml(ICON_ADD, APPEND_TITLE, true),
        action: { click: startAppend, dragstart: startAppend },
      };

      const startConnect = (event: Event) => {
        this.connect.start(event as MouseEvent, shape as unknown as Element);
      };
      entries['connect'] = {
        group: 'edit',
        title: 'Connect to existing sticky',
        html: cpHtml(ICON_ARROW_FORWARD, 'Connect to existing sticky', true),
        action: { click: startConnect, dragstart: startConnect },
      };

      entries['change-kind'] = {
        group: 'sticky',
        title: 'Change type',
        html: cpHtml(ICON_AUTORENEW, 'Change type'),
        action: {
          click: (event: Event) => {
            const e = event as MouseEvent;
            this.popupMenu.open(shape as unknown as Element, POPUP_PROVIDER_ID, {
              x: e.clientX,
              y: e.clientY,
            });
          },
        },
      };
    }

    // Drawings: cycle the stroke style (solid -> dashed -> dotted).
    if (kind === 'drawing') {
      const next =
        shape.strokeStyle === 'dashed'
          ? 'dotted'
          : shape.strokeStyle === 'dotted'
            ? undefined
            : 'dashed';
      const title = `Line style: ${shape.strokeStyle ?? 'solid'} (click to change)`;
      entries['stroke-style'] = {
        group: 'sticky',
        title,
        html: cpHtml(ICON_SWAP_HORIZ, title),
        action: {
          click: () => this.eventStormingModeling.setStrokeStyle(shape, next),
        },
      };
    }

    // Recoloring is offered for DRAWINGS only — stickies and notes carry their notation color
    // (the model-wide `color` override and the DSL `(color ...)` suffix still round-trip, there
    // is just no pad action for them).
    if (kind === 'drawing') {
      entries['color'] = {
        group: 'sticky',
        title: 'Color',
        html: cpHtml(ICON_PALETTE, 'Color'),
        action: {
          click: (event: Event) => {
            const e = event as MouseEvent;
            this.colorPicker.open(shape, e.clientX, e.clientY);
          },
        },
      };
    }

    // Drawings have no label (pure geometry).
    if (kind !== 'drawing') {
      entries['edit-label'] = {
        group: 'edit',
        title: 'Edit label',
        html: cpHtml(ICON_EDIT, 'Edit label'),
        action: { click: () => this.labelEditing.activate(shape) },
      };
    }

    entries['delete'] = {
      group: 'edit',
      title: 'Delete',
      html: cpHtml(ICON_DELETE, 'Delete'),
      action: { click: () => this.modeling.removeElements([shape as unknown as Element]) },
    };

    return entries;
  }
}
