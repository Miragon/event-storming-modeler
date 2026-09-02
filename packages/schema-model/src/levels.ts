/** Workshop-level constants (DOM-free single source of truth for all creation surfaces). */

import type { BoardLevel, ElementType } from './types.js';

/** Effective level when `config.level` is absent — everything available. */
export const DEFAULT_BOARD_LEVEL: BoardLevel = 'design';

/**
 * Sticky kinds offered per level (palette, typed append, change-type popup).
 * `note` and `drawing` are annotations — always available, hence not listed here.
 */
export const LEVEL_STICKY_KINDS: Record<BoardLevel, readonly ElementType[]> = {
  'big-picture': ['event', 'actor', 'external', 'hotspot'],
  process: ['event', 'command', 'actor', 'policy', 'readmodel', 'external', 'hotspot'],
  design: ['event', 'command', 'actor', 'aggregate', 'policy', 'readmodel', 'external', 'hotspot'],
};
