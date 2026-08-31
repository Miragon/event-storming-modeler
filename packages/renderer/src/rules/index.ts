import type { ModuleDeclaration } from 'didi';
import EventStormingRules from './EventStormingRules.js';

/** Allowed Event Storming operations (RuleProvider). */
export const eventStormingRulesModule: ModuleDeclaration = {
  __init__: ['eventStormingRules'],
  eventStormingRules: ['type', EventStormingRules],
};

export { default as EventStormingRules } from './EventStormingRules.js';
