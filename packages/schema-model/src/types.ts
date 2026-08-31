/**
 * Event Storming metamodel.
 *
 * All interfaces are `readonly` and serve purely as the serialization/interface format.
 * The runtime source of truth while editing lives in the mutable diagram-js DI properties
 * (@miragon/event-storming-renderer). `exportMap()` builds an `EventStormingBoard` from
 * those properties.
 *
 * Coordinates are board units = pixels, unbounded (may be negative). An element's
 * `position` is its CENTER — the single source of positional truth end-to-end; the
 * renderer converts center <-> diagram-js top-left via the per-kind width/height.
 */

/** Position in board pixels. Unbounded — the canvas is free. */
export interface Coordinate {
  readonly x: number;
  readonly y: number;
}

export type ElementType =
  | 'event'
  | 'command'
  | 'actor'
  | 'aggregate'
  | 'policy'
  | 'readmodel'
  | 'external'
  | 'hotspot'
  | 'note'
  | 'drawing';

export interface BoardElementBase {
  readonly id: string;
  readonly elementType: ElementType;
  readonly label: string;
  /** Element CENTER in board pixels. */
  readonly position: Coordinate;
  /**
   * Optional element color override (CSS color, typically hex from the renderer's palette).
   * Serialized in the DSL as the project extension `(color …)` after the coordinates.
   */
  readonly color?: string;
}

/** Orange sticky: something that happened in the domain, past tense. */
export interface DomainEventElement extends BoardElementBase {
  readonly elementType: 'event';
}

/** Blue sticky: an intent/action that triggers a domain event. */
export interface CommandElement extends BoardElementBase {
  readonly elementType: 'command';
}

/** Small yellow sticky: the person issuing commands. */
export interface ActorElement extends BoardElementBase {
  readonly elementType: 'actor';
}

/** Large yellow sticky: the consistency boundary that handles commands and emits events. */
export interface AggregateElement extends BoardElementBase {
  readonly elementType: 'aggregate';
}

/** Lilac sticky: reactive logic — "whenever X happens, do Y". */
export interface PolicyElement extends BoardElementBase {
  readonly elementType: 'policy';
}

/** Green sticky: information a user looks at to make a decision. */
export interface ReadModelElement extends BoardElementBase {
  readonly elementType: 'readmodel';
}

/** Pink sticky: a third-party system outside the team's control. */
export interface ExternalSystemElement extends BoardElementBase {
  readonly elementType: 'external';
}

/** Red sticky: an open question, conflict or risk spotted during the workshop. */
export interface HotspotElement extends BoardElementBase {
  readonly elementType: 'hotspot';
}

/** Free-text note; auto-sizes to its text. */
export interface NoteElement extends BoardElementBase {
  readonly elementType: 'note';
}

export type DrawingStrokeStyle = 'solid' | 'dashed' | 'dotted';

/**
 * Freeform polyline/polygon (project extension, Excalidraw-style annotation drawing).
 * `position` mirrors the first point; `points` are absolute board pixels.
 */
export interface DrawingElement extends BoardElementBase {
  readonly elementType: 'drawing';
  readonly points: readonly Coordinate[];
  /** true = closed polygon, false/absent = open polyline. */
  readonly closed?: boolean;
  readonly strokeStyle?: DrawingStrokeStyle;
}

export type BoardElement =
  | DomainEventElement
  | CommandElement
  | ActorElement
  | AggregateElement
  | PolicyElement
  | ReadModelElement
  | ExternalSystemElement
  | HotspotElement
  | NoteElement
  | DrawingElement;

/** The single edge kind: a directed arrow between two stickies. */
export interface Arrow {
  readonly id: string;
  readonly edgeType: 'arrow';
  /** BoardElement.id of the source sticky. */
  readonly from: string;
  /** BoardElement.id of the target sticky. */
  readonly to: string;
  /** Annotation text after `;`, e.g. `Order Placed -> Ship Order; async`. */
  readonly label?: string;
}

export type BoardEdge = Arrow;

export interface BoardConfig {
  readonly title: string;
  readonly style?: 'classic' | 'dark';
}

/** Root object. Domain and layout are separated logically (not physically). */
export interface EventStormingBoard {
  readonly schemaVersion: number;
  readonly config: BoardConfig;
  readonly elements: readonly BoardElement[];
  readonly edges: readonly BoardEdge[];
  /** Preserve unknown/future DSL lines losslessly (round-trip fidelity). */
  readonly rawPassthrough?: readonly string[];
}
