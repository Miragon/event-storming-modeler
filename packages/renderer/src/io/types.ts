import type { BoardConfig } from '@miragon/event-storming-schema-model';

export { ROOT_ID } from '../model/di-types.js';

export interface ImportWarning {
  /** For the person who reads it; a parser finding starts with its line: "Line 4: …". */
  readonly message: string;
  readonly elementId?: string;
  /** A parser finding's 1-based line in the board text. */
  readonly line?: number;
  /** A parser finding's source line, comment-stripped. */
  readonly source?: string;
}

/** Board metadata stored on the root element (config + lossless passthrough). */
export interface RootBusinessObject {
  readonly config: BoardConfig;
  readonly rawPassthrough?: readonly string[];
}
