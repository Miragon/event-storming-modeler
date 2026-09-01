import type { ModuleDeclaration } from 'didi';
import ChangeSupportModule from 'diagram-js/lib/features/change-support';
import EventStormingViewOptions from './EventStormingViewOptions.js';

/**
 * View preferences (e.g. type captions). Depends on change support so that toggling
 * re-renders even in plain Viewers, which do not pull in the modeling stack.
 */
export const eventStormingViewOptionsModule: ModuleDeclaration = {
  __depends__: [ChangeSupportModule],
  eventStormingViewOptions: ['type', EventStormingViewOptions],
};

export { default as EventStormingViewOptions } from './EventStormingViewOptions.js';
export { VIEW_OPTIONS_CHANGED_EVENT } from './EventStormingViewOptions.js';
