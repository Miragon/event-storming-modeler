import type { ModuleDeclaration } from 'didi';
import EventStormingElementSettingsProvider from './EventStormingElementSettingsProvider.js';

/** Popup submenu for retyping a sticky ("Change type"). */
export const eventStormingPopupModule: ModuleDeclaration = {
  __init__: ['eventStormingElementSettings'],
  eventStormingElementSettings: ['type', EventStormingElementSettingsProvider],
};

export {
  default as EventStormingElementSettingsProvider,
  POPUP_PROVIDER_ID,
} from './EventStormingElementSettingsProvider.js';
