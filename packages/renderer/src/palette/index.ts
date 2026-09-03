import type { ModuleDeclaration } from 'didi';
import EventStormingPaletteProvider from './EventStormingPaletteProvider.js';
import EventStormingPaletteTooltip from './EventStormingPaletteTooltip.js';

/** Tool palette (drag-to-create). `paletteTooltip` overrides the diagram-js service of that name. */
export const eventStormingPaletteModule: ModuleDeclaration = {
  __init__: ['eventStormingPaletteProvider', 'paletteTooltip'],
  eventStormingPaletteProvider: ['type', EventStormingPaletteProvider],
  paletteTooltip: ['type', EventStormingPaletteTooltip],
};

export { default as EventStormingPaletteProvider } from './EventStormingPaletteProvider.js';
export { default as EventStormingPaletteTooltip } from './EventStormingPaletteTooltip.js';
