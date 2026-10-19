import type { ElementType } from '@miragon/event-storming-schema-model';
import { slug } from './lexer.js';

/** Sticky keywords double as `elementType` values; the value is the ID prefix. */
export const STICKY_ID_PREFIXES: Readonly<Partial<Record<ElementType, string>>> = {
  event: 'event',
  command: 'cmd',
  actor: 'actor',
  aggregate: 'agg',
  policy: 'policy',
  readmodel: 'read',
  external: 'ext',
  hotspot: 'hot',
};

// Board ids become diagram-js element ids, and the renderer's root elements live in the same
// registry: an element claiming one of these would make the import throw halfway through.
const ENGINE_ID_RE = /^(?:event-storming-root$|__implicitroot)/;

export function isEngineId(id: string): boolean {
  return ENGINE_ID_RE.test(id);
}

/**
 * The parser's id allocation, shared with the serializer: the serializer replays it in emit order
 * to decide which ids the text has to carry so that every sticky gets its id back on re-import.
 */
export class IdAllocator {
  private readonly used = new Set<string>();

  /** Explicit `(id …)` — false when the id is taken or reserved (caller reports + allocates). */
  claim(id: string): boolean {
    if (this.used.has(id) || isEngineId(id)) return false;
    this.used.add(id);
    return true;
  }

  /** The id `alloc(prefix, label)` would return, without taking it. */
  peek(prefix: string, label: string): string {
    const base = `${prefix}_${slug(label)}`;
    let id = base;
    let i = 2;
    while (this.used.has(id)) id = `${base}_${i++}`;
    return id;
  }

  alloc(prefix: string, label: string): string {
    const id = this.peek(prefix, label);
    this.used.add(id);
    return id;
  }
}
