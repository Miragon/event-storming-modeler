import type { ModuleDeclaration } from 'didi';
import EventStormingElementFactory from './EventStormingElementFactory.js';

/** Custom ElementFactory with Event Storming sticky defaults. */
export const eventStormingModelModule: ModuleDeclaration = {
  eventStormingElementFactory: ['type', EventStormingElementFactory],
};

export { default as EventStormingElementFactory } from './EventStormingElementFactory.js';
export * from './di-types.js';
