import type { ModuleDeclaration } from 'didi';
import AttachSupportModule from 'diagram-js/lib/features/attach-support';
import EventStormingAttachBehavior from './EventStormingAttachBehavior.js';

/**
 * Pinning of actor/hotspot stickies: the stock diagram-js AttachSupport (host/attachers
 * move-together, delete-together — the bpmn-js boundary-event machinery) plus the Event
 * Storming retype consistency behavior.
 */
export const eventStormingAttachModule: ModuleDeclaration = {
  __depends__: [AttachSupportModule],
  __init__: ['eventStormingAttachBehavior'],
  eventStormingAttachBehavior: ['type', EventStormingAttachBehavior],
};

export { default as EventStormingAttachBehavior } from './EventStormingAttachBehavior.js';
