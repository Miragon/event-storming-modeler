import type { ModuleDeclaration } from 'didi';
import EventStormingKeyboard from './EventStormingKeyboard.js';

/** Undo/redo/delete via keyboard on the canvas container. */
export const eventStormingKeyboardModule: ModuleDeclaration = {
  __init__: ['eventStormingKeyboard'],
  eventStormingKeyboard: ['type', EventStormingKeyboard],
};

export { default as EventStormingKeyboard } from './EventStormingKeyboard.js';
