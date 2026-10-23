import type Palette from 'diagram-js/lib/features/palette/Palette';
import type Canvas from 'diagram-js/lib/core/Canvas';
import type Create from 'diagram-js/lib/features/create/Create';
import type ElementRegistry from 'diagram-js/lib/core/ElementRegistry';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type Modeling from 'diagram-js/lib/features/modeling/Modeling';
import type Selection from 'diagram-js/lib/features/selection/Selection';
import type { Shape } from 'diagram-js/lib/model/Types';
import type { FreeArea } from '@miragon/modeler-api';
import type LassoTool from 'diagram-js/lib/features/lasso-tool/LassoTool';
import type EventStormingDrawTool from '../draw-tool/EventStormingDrawTool.js';
import type {
  PaletteEntries,
  PaletteEntry,
  default as PaletteProvider,
} from 'diagram-js/lib/features/palette/PaletteProvider';
import { LEVEL_STICKY_KINDS } from '@miragon/event-storming-schema-model';
import type EventStormingElementFactory from '../model/EventStormingElementFactory.js';
import type EventStormingModeling from '../modeling/EventStormingModeling.js';
import type EventStormingLabelEditing from '../label-editing/EventStormingLabelEditing.js';
import {
  ROOT_ID,
  isEventStormingShape,
  type EventStormingShape,
  type EventStormingShapeType,
} from '../model/di-types.js';
import { NOTE_STYLE, STICKY_STYLES } from '../draw/styles.js';
import { PALETTE_ICONS } from '../draw/palette-icons.js';

/** Container margins in screen px that the host's chrome covers. */
export interface FreeRectInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type { FreeArea };

export interface EventStormingPaletteConfig {
  freeArea?: FreeArea | undefined;
  /** @deprecated Pass `freeArea: { insets }` instead; accepted through 0.5.x, removed in 0.6.0. */
  freeRectInsets?: (() => FreeRectInsets) | undefined;
}

/** The free area of the options: the modeler-api name first, then the deprecated one. */
export function resolveFreeArea(options: {
  freeArea?: FreeArea | undefined;
  freeRectInsets?: (() => FreeRectInsets) | undefined;
}): FreeArea | undefined {
  if (options.freeArea) return options.freeArea;
  const insets = options.freeRectInsets;
  return insets ? { insets } : undefined;
}

/** Guide §5.5: a keyboard-created element lands this far down-right of one already centred there. */
const KEYBOARD_CREATE_OFFSET = 24;

interface PaletteSpec {
  key: string;
  type: EventStormingShapeType;
  label: string;
  title: string;
  shortcut?: string;
  group: string;
}

// Group IDs with a prefix number -> stable, visible ordering of the palette groups.
const GROUP_STICKIES_1 = 'stickies-1';
const GROUP_STICKIES_2 = 'stickies-2';
const GROUP_STICKIES_3 = 'stickies-3';

const SPECS: readonly PaletteSpec[] = [
  {
    key: 'event',
    type: 'event',
    label: STICKY_STYLES.event.label,
    title: 'Domain event',
    shortcut: 'E',
    group: GROUP_STICKIES_1,
  },
  {
    key: 'command',
    type: 'command',
    label: STICKY_STYLES.command.label,
    title: 'Command',
    shortcut: 'C',
    group: GROUP_STICKIES_1,
  },
  {
    key: 'actor',
    type: 'actor',
    label: STICKY_STYLES.actor.label,
    title: 'Actor',
    group: GROUP_STICKIES_1,
  },
  {
    key: 'aggregate',
    type: 'aggregate',
    label: STICKY_STYLES.aggregate.label,
    title: 'Aggregate',
    group: GROUP_STICKIES_1,
  },
  {
    key: 'policy',
    type: 'policy',
    label: STICKY_STYLES.policy.label,
    title: 'Policy',
    group: GROUP_STICKIES_2,
  },
  {
    key: 'readmodel',
    type: 'readmodel',
    label: STICKY_STYLES.readmodel.label,
    title: 'Read model',
    group: GROUP_STICKIES_2,
  },
  {
    key: 'external',
    type: 'external',
    label: STICKY_STYLES.external.label,
    title: 'External system',
    group: GROUP_STICKIES_2,
  },
  {
    key: 'hotspot',
    type: 'hotspot',
    label: STICKY_STYLES.hotspot.label,
    title: 'Hotspot',
    group: GROUP_STICKIES_3,
  },
  {
    key: 'note',
    type: 'note',
    label: NOTE_STYLE.label,
    title: 'Note',
    group: GROUP_STICKIES_3,
  },
];

export default class EventStormingPaletteProvider implements PaletteProvider {
  static $inject = [
    'palette',
    'create',
    'eventStormingElementFactory',
    'lassoTool',
    'eventStormingDrawTool',
    'eventStormingModeling',
    'eventBus',
    'canvas',
    'modeling',
    'selection',
    'elementRegistry',
    'eventStormingLabelEditing',
    'config.eventStormingPalette',
  ];

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly factory: EventStormingElementFactory,
    private readonly lassoTool: LassoTool,
    private readonly drawTool: EventStormingDrawTool,
    private readonly eventStormingModeling: EventStormingModeling,
    eventBus: EventBus,
    private readonly canvas?: Canvas,
    private readonly modeling?: Modeling,
    private readonly selection?: Selection,
    private readonly elementRegistry?: ElementRegistry,
    private readonly labelEditing?: EventStormingLabelEditing,
    private readonly config?: EventStormingPaletteConfig,
  ) {
    palette.registerProvider(this);

    // The level filters the entries, but diagram-js renders the palette once — re-query the
    // providers whenever the effective level may have changed: a (re)imported board and
    // setLevel incl. its undo/redo (= any updateProperties on the root, where config lives).
    // `_rebuild` is the internal diagram-js refresh; it guards against pre-init calls.
    const rebuild = () => (palette as unknown as { _rebuild(): void })._rebuild();
    eventBus.on('import.done', rebuild);
    eventBus.on(
      [
        'commandStack.element.updateProperties.postExecuted',
        'commandStack.element.updateProperties.reverted',
      ],
      (event: { context: { element: { id: string } } }) => {
        if (event.context.element.id === ROOT_ID) rebuild();
      },
    );
  }

  getPaletteEntries(): PaletteEntries {
    const entries: Record<string, PaletteEntry> = {};

    // Lasso tool first. Group MUST be called "tools" and the key end in "-tool" — that is
    // what diagram-js' palette uses to highlight the active tool (tool-manager.update).
    entries['lasso-tool'] = {
      group: 'tools',
      title: 'Lasso',
      shortcut: 'L',
      html: `<div class="entry event-storming-palette-entry">${PALETTE_ICONS.lasso}</div>`,
      action: {
        click: (event: Event) => this.lassoTool.activateSelection(event as MouseEvent),
      },
    };

    entries['draw-tool'] = {
      group: 'tools',
      title: 'Draw',
      html: `<div class="entry event-storming-palette-entry">${PALETTE_ICONS.draw}</div>`,
      action: {
        click: () => this.drawTool.toggle(),
      },
    };

    // Sticky kinds are filtered by the workshop level; notes are annotations and always stay.
    const allowed = LEVEL_STICKY_KINDS[this.eventStormingModeling.getLevel()];
    for (const spec of SPECS) {
      if (spec.type !== 'note' && !allowed.includes(spec.type)) continue;
      const start = (event: Event) => {
        const shape = this.factory.createNew(spec.type, spec.label);
        if (isKeyboardClick(event) && this.placeInFreeRect(shape)) return;
        this.create.start(event, shape);
      };
      entries[`create.${spec.key}`] = {
        group: spec.group,
        title: spec.title,
        ...(spec.shortcut ? { shortcut: spec.shortcut } : {}),
        html: `<div class="entry event-storming-palette-entry" draggable="true">${PALETTE_ICONS[spec.key]}</div>`,
        action: { dragstart: start, click: start },
      };
    }
    return entries;
  }

  /**
   * Enter or Space on a creating entry (guide §5.5): a create that follows the pointer never ends
   * without one, so the element goes straight to the centre of the free rectangle, selected and
   * with its label editor open. False when the services for it are missing.
   */
  private placeInFreeRect(shape: EventStormingShape): boolean {
    const { canvas, modeling, selection, elementRegistry } = this;
    if (!canvas || !modeling || !selection || !elementRegistry) return false;
    const centre = this.freeAreaCentre(canvas);
    const taken = (point: { x: number; y: number }) =>
      elementRegistry
        .filter(isEventStormingShape)
        .some(
          (element) =>
            Math.abs(element.x + element.width / 2 - point.x) < 1 &&
            Math.abs(element.y + element.height / 2 - point.y) < 1,
        );
    while (taken(centre)) {
      centre.x += KEYBOARD_CREATE_OFFSET;
      centre.y += KEYBOARD_CREATE_OFFSET;
    }
    const created = modeling.createShape(shape, centre, canvas.getRootElement() as Shape);
    selection.select(created);
    canvas.focus();
    this.labelEditing?.activate(created as unknown as EventStormingShape);
    return true;
  }

  /** The centre of what the chrome leaves free, in diagram coordinates. */
  private freeAreaCentre(canvas: Canvas): { x: number; y: number } {
    const freeArea = this.config && resolveFreeArea(this.config);
    const given = freeArea?.center?.();
    if (given) return { x: given.x, y: given.y };
    const viewbox = canvas.viewbox();
    const insets = freeArea?.insets?.() ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const freeWidth = Math.max(0, viewbox.outer.width - insets.left - insets.right);
    const freeHeight = Math.max(0, viewbox.outer.height - insets.top - insets.bottom);
    return {
      x: viewbox.x + (insets.left + freeWidth / 2) / viewbox.scale,
      y: viewbox.y + (insets.top + freeHeight / 2) / viewbox.scale,
    };
  }
}

/** A click the shell synthesises for Enter or Space on a palette entry (no pointer, detail 0). */
function isKeyboardClick(event: Event): boolean {
  return event.type === 'click' && (event as MouseEvent).detail === 0;
}
