import type { ModuleDeclaration } from 'didi';
import EventStormingDrawTool from './EventStormingDrawTool.js';
import EventStormingDrawingHandles from './EventStormingDrawingHandles.js';
import EventStormingDrawingHitProvider from './EventStormingDrawingHitProvider.js';

export const eventStormingDrawToolModule: ModuleDeclaration = {
  __init__: [
    'eventStormingDrawTool',
    'eventStormingDrawingHandles',
    'eventStormingDrawingHitProvider',
  ],
  eventStormingDrawTool: ['type', EventStormingDrawTool],
  eventStormingDrawingHandles: ['type', EventStormingDrawingHandles],
  eventStormingDrawingHitProvider: ['type', EventStormingDrawingHitProvider],
};

export { default as EventStormingDrawTool } from './EventStormingDrawTool.js';
export { default as EventStormingDrawingHandles } from './EventStormingDrawingHandles.js';
export { default as EventStormingDrawingHitProvider } from './EventStormingDrawingHitProvider.js';
