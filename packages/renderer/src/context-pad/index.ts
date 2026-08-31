import type { ModuleDeclaration } from 'didi';
import EventStormingContextPadProvider from './EventStormingContextPadProvider.js';

/** Context actions per element. */
export const eventStormingContextPadModule: ModuleDeclaration = {
  __init__: ['eventStormingContextPadProvider'],
  eventStormingContextPadProvider: ['type', EventStormingContextPadProvider],
};

export { default as EventStormingContextPadProvider } from './EventStormingContextPadProvider.js';
