import type { ModuleDeclaration } from 'didi';
import EventStormingRenderer from './EventStormingRenderer.js';

/** SVG rendering of all Event Storming stickies (BaseRenderer subclass, priority 1500). */
export const eventStormingDrawModule: ModuleDeclaration = {
  __init__: ['eventStormingRenderer'],
  eventStormingRenderer: ['type', EventStormingRenderer],
};

export { default as EventStormingRenderer } from './EventStormingRenderer.js';
