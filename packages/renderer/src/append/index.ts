import type { ModuleDeclaration } from 'didi';
import ConnectionPreviewModule from 'diagram-js/lib/features/connection-preview';
import EventStormingAppendBehavior from './EventStormingAppendBehavior.js';

/**
 * "Append sticky": pulls in the `connectionPreview` service (thereby also enabling the connect
 * tool's arrow preview) and registers the append behavior (live arrow preview + automatically
 * opening the label editor after creation).
 */
export const eventStormingAppendModule: ModuleDeclaration = {
  __depends__: [ConnectionPreviewModule],
  __init__: ['eventStormingAppendBehavior'],
  eventStormingAppendBehavior: ['type', EventStormingAppendBehavior],
};

export { default as EventStormingAppendBehavior } from './EventStormingAppendBehavior.js';
