import type { BoardConfig } from '@miragon/event-storming-schema-model';

export { ROOT_ID } from '../model/di-types.js';

export interface ImportWarning {
  readonly message: string;
  readonly elementId?: string;
}

/** Board metadata stored on the root element (config + lossless passthrough). */
export interface RootBusinessObject {
  readonly config: BoardConfig;
  readonly rawPassthrough?: readonly string[];
}
