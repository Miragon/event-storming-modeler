import type { ModuleDeclaration } from 'didi';
import EventStormingRenderer from './EventStormingRenderer.js';
import { eventStormingViewOptionsModule } from '../view-options/index.js';

/** SVG rendering of all Event Storming stickies (BaseRenderer subclass, priority 1500). */
export const eventStormingDrawModule: ModuleDeclaration = {
  // The renderer reads the caption toggle — carry the providing module along for consumers
  // that wire the draw module standalone (didi dedupes it against the Viewer's own entry).
  __depends__: [eventStormingViewOptionsModule],
  __init__: ['eventStormingRenderer'],
  eventStormingRenderer: ['type', EventStormingRenderer],
};

export { default as EventStormingRenderer } from './EventStormingRenderer.js';
export {
  parseNoteMarkdown,
  serializeNoteMarkdown,
  plainNoteText,
  type NoteLine,
  type NoteRun,
} from './note-markdown.js';
