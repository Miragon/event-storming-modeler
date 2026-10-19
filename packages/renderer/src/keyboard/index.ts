import type { ModuleDeclaration } from 'didi';
import EventStormingKeyboard from './EventStormingKeyboard.js';

/** Undo/redo, delete, copy/paste, nudge and the single-key tools for keys aimed at the canvas. */
export const eventStormingKeyboardModule: ModuleDeclaration = {
  __init__: ['eventStormingKeyboard'],
  eventStormingKeyboard: ['type', EventStormingKeyboard],
};

export { default as EventStormingKeyboard } from './EventStormingKeyboard.js';
export type { EventStormingKeyboardConfig } from './EventStormingKeyboard.js';
