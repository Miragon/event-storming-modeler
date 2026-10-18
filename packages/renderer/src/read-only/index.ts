import type { ModuleDeclaration } from 'didi';
import RulesModule from 'diagram-js/lib/features/rules';
import EventStormingReadOnly from './EventStormingReadOnly.js';

/** The canvas edit lock (invalid file in an IDE host). */
export const eventStormingReadOnlyModule: ModuleDeclaration = {
  __depends__: [RulesModule],
  __init__: ['eventStormingReadOnly'],
  eventStormingReadOnly: ['type', EventStormingReadOnly],
};

export {
  default as EventStormingReadOnly,
  READ_ONLY_CHANGED_EVENT,
} from './EventStormingReadOnly.js';
