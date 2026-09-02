import type Palette from 'diagram-js/lib/features/palette/Palette';
import type Create from 'diagram-js/lib/features/create/Create';
import type EventBus from 'diagram-js/lib/core/EventBus';
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
import { ROOT_ID, type EventStormingShapeType } from '../model/di-types.js';
import { NOTE_STYLE, STICKY_STYLES } from '../draw/styles.js';
import { PALETTE_ICONS } from '../draw/palette-icons.js';

interface PaletteSpec {
  key: string;
  type: EventStormingShapeType;
  label: string;
  title: string;
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
    title: 'Domain Event — E',
    group: GROUP_STICKIES_1,
  },
  {
    key: 'command',
    type: 'command',
    label: STICKY_STYLES.command.label,
    title: 'Command — C',
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
    title: 'Read Model',
    group: GROUP_STICKIES_2,
  },
  {
    key: 'external',
    type: 'external',
    label: STICKY_STYLES.external.label,
    title: 'External System',
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
  ];

  constructor(
    palette: Palette,
    private readonly create: Create,
    private readonly factory: EventStormingElementFactory,
    private readonly lassoTool: LassoTool,
    private readonly drawTool: EventStormingDrawTool,
    private readonly eventStormingModeling: EventStormingModeling,
    eventBus: EventBus,
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

    // Selection tool first. Group MUST be called "tools" and the key end in "-tool" — that is
    // what diagram-js' palette uses to highlight the active tool (tool-manager.update).
    entries['lasso-tool'] = {
      group: 'tools',
      title: 'Selection tool — L (or Shift+drag)',
      html: `<div class="entry event-storming-palette-entry" title="Selection tool — L (or Shift+drag)">${PALETTE_ICONS.lasso}</div>`,
      action: {
        click: (event: Event) => this.lassoTool.activateSelection(event as MouseEvent),
      },
    };

    entries['draw-tool'] = {
      group: 'tools',
      title:
        'Draw — click point by point, double-click/Enter finishes, click the start point to close',
      html: `<div class="entry event-storming-palette-entry" title="Draw — click point by point, double-click/Enter finishes, click the start point to close">${PALETTE_ICONS.draw}</div>`,
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
        this.create.start(event, shape);
      };
      entries[`create.${spec.key}`] = {
        group: spec.group,
        title: spec.title,
        html: `<div class="entry event-storming-palette-entry" draggable="true" title="${spec.title}">${PALETTE_ICONS[spec.key]}</div>`,
        action: { dragstart: start, click: start },
      };
    }
    return entries;
  }
}
