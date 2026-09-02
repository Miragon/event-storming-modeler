import type { ModuleDeclaration } from 'didi';
import EventStormingColorPicker from './EventStormingColorPicker.js';

/** Sticky color picker (3x3 swatch popover). */
export const eventStormingColorPickerModule: ModuleDeclaration = {
  __init__: ['eventStormingColorPicker'],
  eventStormingColorPicker: ['type', EventStormingColorPicker],
};

export { default as EventStormingColorPicker } from './EventStormingColorPicker.js';
