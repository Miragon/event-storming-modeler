import type { ModuleDeclaration } from 'didi';
import EventStormingOrderingProvider from './EventStormingOrderingProvider.js';

/** Z-order for interactive edits: drawings -> connections -> stickies (like the import). */
export const eventStormingOrderingModule: ModuleDeclaration = {
  __init__: ['eventStormingOrderingProvider'],
  eventStormingOrderingProvider: ['type', EventStormingOrderingProvider],
};

export { default as EventStormingOrderingProvider } from './EventStormingOrderingProvider.js';
