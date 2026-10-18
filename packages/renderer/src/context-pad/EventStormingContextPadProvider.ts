import type ContextPad from 'diagram-js/lib/features/context-pad/ContextPad';
import type EventBus from 'diagram-js/lib/core/EventBus';
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
import { READ_ONLY_CHANGED_EVENT, type EventStormingReadOnly } from '../read-only/index.js';
import { chromeIcon, type LucideIconName } from '../draw/lucide.js';

/** Title of the single append entry — the kind is chosen in the popup, not in the pad. */
const APPEND_TITLE = 'Append sticky (auto-connect, choose the type after placing)';

/**
 * ContextPad entry as HTML with a Lucide icon. `draggable=true` is mandatory for entries with a
 * `dragstart` action — otherwise diagram-js does not fire the drag.
 */
function cpHtml(icon: LucideIconName, title: string, draggable = false): string {
  return `<div class="entry event-storming-cp-entry"${draggable ? ' draggable="true"' : ''} title="${title}">${chromeIcon(icon)}</div>`;
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
    'eventBus',
    'eventStormingReadOnly',
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
    eventBus?: EventBus,
    private readonly readOnly?: Pick<EventStormingReadOnly, 'isReadOnly'>,
  ) {
    contextPad.registerProvider(this);
    eventBus?.on(READ_ONLY_CHANGED_EVENT, (event: { readOnly?: boolean }) => {
      if (event.readOnly) contextPad.close();
    });
  }

  getContextPadEntries(element: Element): ContextPadEntries {
    if (this.readOnly?.isReadOnly()) return {};
    // Connections: edit the arrow annotation + delete.
    if (isEventStormingConnection(element)) {
      const conn = element;
      return {
        'edit-label': {
          group: 'edit',
          title: 'Edit arrow label',
          html: cpHtml('pencil', 'Edit arrow label'),
          action: { click: () => this.labelEditing.activateConnection(conn) },
        },
        delete: {
          group: 'delete',
          title: 'Delete connection',
          html: cpHtml('trash', 'Delete connection'),
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
        html: cpHtml('plus', APPEND_TITLE, true),
        action: { click: startAppend, dragstart: startAppend },
      };

      const startConnect = (event: Event) => {
        this.connect.start(event as MouseEvent, shape as unknown as Element);
      };
      entries['connect'] = {
        group: 'edit',
        title: 'Connect to existing sticky',
        html: cpHtml('arrow-right', 'Connect to existing sticky', true),
        action: { click: startConnect, dragstart: startConnect },
      };

      entries['change-kind'] = {
        group: 'edit',
        title: 'Change type',
        html: cpHtml('replace', 'Change type'),
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
        group: 'edit',
        title,
        html: cpHtml('line-style', title),
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
        group: 'edit',
        title: 'Color',
        html: cpHtml('palette', 'Color'),
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
        html: cpHtml('pencil', 'Edit label'),
        action: { click: () => this.labelEditing.activate(shape) },
      };
    }

    // Its own group, appended last: the destructive entry closes the island (guide §8).
    entries['delete'] = {
      group: 'delete',
      title: 'Delete',
      html: cpHtml('trash', 'Delete'),
      action: { click: () => this.modeling.removeElements([shape as unknown as Element]) },
    };

    return entries;
  }
}
