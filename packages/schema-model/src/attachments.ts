/** Attachment (pinning) constants — DOM-free single source of truth for model, DSL and renderer. */

import type { ElementType } from './types.js';

/** Element kinds that can be pinned onto a host sticky and then move with it. */
export const ATTACHABLE_STICKY_KINDS = [
  'actor',
  'hotspot',
  'note',
] as const satisfies readonly ElementType[];

/**
 * Sticky kinds that can carry attachments. Attachable kinds and drawings are never
 * hosts — so attach chains cannot exist.
 */
export const HOST_STICKY_KINDS = [
  'event',
  'command',
  'aggregate',
  'policy',
  'readmodel',
  'external',
] as const satisfies readonly ElementType[];
