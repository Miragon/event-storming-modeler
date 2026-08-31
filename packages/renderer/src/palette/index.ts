import type { ModuleDeclaration } from 'didi';
import EventStormingPaletteProvider from './EventStormingPaletteProvider.js';

/** Tool palette (drag-to-create). */
export const eventStormingPaletteModule: ModuleDeclaration = {
  __init__: ['eventStormingPaletteProvider'],
  eventStormingPaletteProvider: ['type', EventStormingPaletteProvider],
};

export { default as EventStormingPaletteProvider } from './EventStormingPaletteProvider.js';
