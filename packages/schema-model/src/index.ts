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
  NoteElement,
  DrawingStrokeStyle,
  DrawingElement,
  BoardElement,
  Arrow,
  BoardEdge,
  BoardConfig,
  EventStormingBoard,
} from './types.js';

// Layout helpers — empty-board framing constant and deterministic timeline order
export { DEFAULT_BOARD_SIZE, sortByTimeline } from './layout.js';

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
