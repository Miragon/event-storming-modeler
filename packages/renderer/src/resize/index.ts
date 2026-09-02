import type { ModuleDeclaration } from 'didi';
import ResizeModule from 'diagram-js/lib/features/resize';
import EventStormingResizeBehavior from './EventStormingResizeBehavior.js';

/**
 * Free note resizing: the stock diagram-js Resize feature (handles, preview, rules check,
 * undoable `shape.resize` command) plus the Event Storming minimum-bounds clamp. Which shapes
 * get handles is decided by the `shape.resize` rule — notes only.
 */
export const eventStormingResizeModule: ModuleDeclaration = {
  __depends__: [ResizeModule],
  __init__: ['eventStormingResizeBehavior'],
  eventStormingResizeBehavior: ['type', EventStormingResizeBehavior],
};

export { default as EventStormingResizeBehavior } from './EventStormingResizeBehavior.js';
