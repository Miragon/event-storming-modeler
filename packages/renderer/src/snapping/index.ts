import type { ModuleDeclaration } from 'didi';
import ElementSnapping from './ElementSnapping.js';

/** Center-to-center sticky snapping while moving/creating (editor-only). */
export const elementSnappingModule: ModuleDeclaration = {
  __init__: ['elementSnapping'],
  elementSnapping: ['type', ElementSnapping],
};

export { default as ElementSnapping } from './ElementSnapping.js';
