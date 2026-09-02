export type {
  Coordinate,
  ElementType,
  BoardElementBase,
  DomainEventElement,
  CommandElement,
  ActorElement,
  AggregateElement,
  PolicyElement,
  ReadModelElement,
  ExternalSystemElement,
  HotspotElement,
  NoteAlignHorizontal,
  NoteAlignVertical,
  NoteAlign,
  NoteElement,
  DrawingStrokeStyle,
  DrawingElement,
  BoardElement,
  Arrow,
  BoardEdge,
  BoardLevel,
  BoardConfig,
  EventStormingBoard,
} from './types.js';

// Layout helpers — empty-board framing constant and deterministic timeline order
export { DEFAULT_BOARD_SIZE, sortByTimeline } from './layout.js';

// Workshop levels — default level and the sticky kinds each level offers
export { DEFAULT_BOARD_LEVEL, LEVEL_STICKY_KINDS } from './levels.js';

// Pinning — which sticky kinds can be attached and which can host them
export { ATTACHABLE_STICKY_KINDS, HOST_STICKY_KINDS } from './attachments.js';

export {
  validateBoard,
  loadBoard,
  parseBoardJSON,
  serializeBoard,
  createEmptyBoard,
} from './serialize.js';

export { eventStormingBoardSchema, boardElementSchema, boardEdgeSchema } from './schema.js';
export type { EventStormingBoardInput } from './schema.js';

export { migrate, CURRENT_SCHEMA_VERSION } from './migrations.js';
