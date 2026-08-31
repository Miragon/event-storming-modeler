import type { ModuleDeclaration } from 'didi';
import EventStormingImporter from './EventStormingImporter.js';
import EventStormingExporter from './EventStormingExporter.js';

export const ioModule: ModuleDeclaration = {
  eventStormingImporter: ['type', EventStormingImporter],
  eventStormingExporter: ['type', EventStormingExporter],
};

export { default as EventStormingImporter } from './EventStormingImporter.js';
export { default as EventStormingExporter } from './EventStormingExporter.js';
export { saveSVG } from './saveSvg.js';
export { ROOT_ID } from './types.js';
export type { ImportWarning, RootBusinessObject } from './types.js';
