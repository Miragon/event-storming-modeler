/**
 * JSON bridge. The canonical JSON format itself lives in @miragon/event-storming-schema-model;
 * these are just descriptive re-exports so consumers can obtain all (de)serializers from
 * @miragon/event-storming-dsl.
 */
export {
  serializeBoard as boardToJSON,
  parseBoardJSON as boardFromJSON,
  loadBoard,
} from '@miragon/event-storming-schema-model';
