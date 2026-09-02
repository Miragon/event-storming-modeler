import type { ModuleDeclaration } from 'didi';
import EventStormingLabelEditing from './EventStormingLabelEditing.js';

/** Custom inline label editing (HTML overlay). */
export const labelEditingModule: ModuleDeclaration = {
  __init__: ['eventStormingLabelEditing'],
  eventStormingLabelEditing: ['type', EventStormingLabelEditing],
};

export { default as EventStormingLabelEditing } from './EventStormingLabelEditing.js';
export {
  noteMarkdownToDom,
  domToNoteMarkdown,
  createNoteToolbar,
  updateAlignButton,
  applyAlignPreview,
  toggleBulletLines,
  insertPlainText,
  NOTE_BULLET_CLASS,
} from './note-editor-dom.js';
export type { NoteToolbarAction, NoteAlignState } from './note-editor-dom.js';
