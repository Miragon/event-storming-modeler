import './assets/event-storming.css';

export { Viewer } from './Viewer.js';
export { NavigatedViewer } from './NavigatedViewer.js';
export { Modeler } from './Modeler.js';
export { EventStormingBaseViewer } from './EventStormingBaseViewer.js';
export type { EventStormingViewerOptions, EventCallback } from './EventStormingBaseViewer.js';

export { eventStormingModelModule, EventStormingElementFactory } from './model/index.js';
export { boardBoundsModule, BoardBounds } from './board-bounds/index.js';
export { eventStormingDrawModule, EventStormingRenderer } from './draw/index.js';
export {
  eventStormingViewOptionsModule,
  EventStormingViewOptions,
  VIEW_OPTIONS_CHANGED_EVENT,
} from './view-options/index.js';
export { COLORS, STICKY_STYLES, NOTE_STYLE } from './draw/styles.js';
export { parseNoteMarkdown, serializeNoteMarkdown, plainNoteText } from './draw/note-markdown.js';
export type { NoteLine, NoteRun } from './draw/note-markdown.js';

/* Miragon brand tokens (single source of truth for colour) — for consumers theming their own chrome. */
export { MIRAGON } from './theme/index.js';
export {
  ioModule,
  EventStormingImporter,
  EventStormingExporter,
  saveSVG,
  ROOT_ID,
} from './io/index.js';
export { eventStormingModelingModule, EventStormingModeling } from './modeling/index.js';
export { eventStormingRulesModule, EventStormingRules } from './rules/index.js';
export { elementSnappingModule } from './snapping/index.js';
export { eventStormingPaletteModule } from './palette/index.js';
export { eventStormingContextPadModule } from './context-pad/index.js';
export { labelEditingModule, EventStormingLabelEditing } from './label-editing/index.js';
export { eventStormingKeyboardModule } from './keyboard/index.js';
export {
  eventStormingPopupModule,
  EventStormingElementSettingsProvider,
  POPUP_PROVIDER_ID,
} from './popup/index.js';
export { eventStormingAppendModule, EventStormingAppendBehavior } from './append/index.js';
export { eventStormingAttachModule, EventStormingAttachBehavior } from './attach/index.js';
export { eventStormingColorPickerModule, EventStormingColorPicker } from './color-picker/index.js';
export { eventStormingResizeModule, EventStormingResizeBehavior } from './resize/index.js';

export {
  isEventStormingShape,
  isEventStormingConnection,
  isSticky,
  isStickyKind,
  isAttachableKind,
  isHostKind,
  isAttachableSticky,
  isHostSticky,
  STICKY_KINDS,
} from './model/di-types.js';
export type {
  EventStormingShape,
  EventStormingConnection,
  EventStormingShapeType,
  EventStormingConnectionType,
  StickyKind,
} from './model/di-types.js';
export type { ImportWarning, RootBusinessObject } from './io/index.js';

// Icons (Material Icons, Apache-2.0) – reusable for consumers' buttons/chrome.
export {
  iconMarkup,
  ICON_UNDO,
  ICON_REDO,
  ICON_DATA_OBJECT,
  ICON_CODE,
  ICON_DOWNLOAD,
  ICON_EDIT,
  ICON_PERSON,
  ICON_SHARE,
  ICON_DELETE,
  ICON_FOLDER_OPEN,
  ICON_IMAGE,
  ICON_NEW,
  ICON_MENU,
  ICON_EYE,
  ICON_FIT,
  ICON_ADD,
} from './draw/icons.js';
