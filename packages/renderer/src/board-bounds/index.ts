import type { ModuleDeclaration } from 'didi';
import BoardBounds from './BoardBounds.js';

/** Content-bbox bounds service (fitView + SVG export framing). */
export const boardBoundsModule: ModuleDeclaration = {
  boardBounds: ['type', BoardBounds],
};

export { default as BoardBounds } from './BoardBounds.js';
export type { Bounds } from './BoardBounds.js';
