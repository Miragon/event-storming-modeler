import type { ModuleDeclaration } from 'didi';
import MouseModule from 'diagram-js/lib/features/mouse';
import CreateModule from 'diagram-js/lib/features/create';
import EventStormingModeling from './EventStormingModeling.js';
import EventStormingCopyPaste from './EventStormingCopyPaste.js';

/** High-level Event Storming mutations + registration of the custom command handlers. */
export const eventStormingModelingModule: ModuleDeclaration = {
  // Mouse/Create are needed by the paste preview (clones attach to the cursor).
  __depends__: [MouseModule, CreateModule],
  __init__: ['eventStormingModeling'],
  eventStormingModeling: ['type', EventStormingModeling],
  eventStormingCopyPaste: ['type', EventStormingCopyPaste],
};

export { default as EventStormingModeling } from './EventStormingModeling.js';
export { default as EventStormingCopyPaste } from './EventStormingCopyPaste.js';
