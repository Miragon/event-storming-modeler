import type { ModuleDeclaration } from 'didi';
import LassoToolModule from 'diagram-js/lib/features/lasso-tool';
import EventStormingLassoBehavior from './EventStormingLassoBehavior.js';

/** Lasso multi-select: diagram-js lasso-tool plus Shift+drag activation on an empty canvas. */
export const eventStormingLassoModule: ModuleDeclaration = {
  __depends__: [LassoToolModule],
  __init__: ['eventStormingLassoBehavior'],
  eventStormingLassoBehavior: ['type', EventStormingLassoBehavior],
};

export { default as EventStormingLassoBehavior } from './EventStormingLassoBehavior.js';
