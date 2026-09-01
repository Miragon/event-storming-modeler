import {
  ATTACHABLE_STICKY_KINDS,
  CURRENT_SCHEMA_VERSION,
  HOST_STICKY_KINDS,
  validateBoard,
  type BoardConfig,
  type BoardEdge,
  type BoardLevel,
  type BoardElement,
  type Coordinate,
  type DrawingElement,
  type DrawingStrokeStyle,
  type ElementType,
  type EventStormingBoard,
  type NoteElement,
} from '@miragon/event-storming-schema-model';
import {
  indexOfOutsideQuotes,
  keywordOf,
  parseColor,
  parseCoords,
  parseId,
  parseMultiCoords,
  parseOn,
  parseSize,
  slug,
  splitAtCoords,
  splitLineComment,
} from './lexer.js';

/** Splits `A -> B` at the FIRST arrow — plain indexOf, immune to regex backtracking. */
function splitArrow(core: string): { left: string; right: string } | null {
  const arrow = core.indexOf('->');
  if (arrow <= 0) return null;
  const left = core.slice(0, arrow).trim();
  const right = core.slice(arrow + 2).trim();
  return left && right ? { left, right } : null;
}

const KNOWN_STYLES: ReadonlySet<string> = new Set(['classic', 'dark']);

const ATTACHABLE_KINDS: ReadonlySet<string> = new Set(ATTACHABLE_STICKY_KINDS);

const HOST_KINDS: ReadonlySet<string> = new Set(HOST_STICKY_KINDS);

const KNOWN_LEVELS: ReadonlySet<string> = new Set(['big-picture', 'process', 'design']);

/** Undoes the serializer's `\n` name escaping (line-based DSL, multi-line labels). */
function decodeName(name: string): string {
  return name.replace(/\\n/g, '\n');
}

/** Sticky keywords double as `elementType` values; the value is the ID prefix. */
const STICKY_ID_PREFIXES: Readonly<Partial<Record<ElementType, string>>> = {
  event: 'event',
  command: 'cmd',
  actor: 'actor',
  aggregate: 'agg',
  policy: 'policy',
  readmodel: 'read',
  external: 'ext',
  hotspot: 'hot',
};

// The 8 sticky kinds — the only legal arrow endpoints (mirrors validateBoard's contract).
const STICKY_KINDS: ReadonlySet<string> = new Set(Object.keys(STICKY_ID_PREFIXES));

interface PendingArrow {
  readonly left: string;
  readonly right: string;
  /** Annotation text after `;`. */
  readonly label?: string;
  readonly raw: string;
  readonly lineNo: number;
}

/** `(on …)` attachment — host referenced BY NAME, resolution deferred like arrow endpoints. */
interface PendingAttachment {
  /** Index into `elements` of the attachable sticky. */
  readonly index: number;
  readonly host: string;
  readonly raw: string;
  readonly lineNo: number;
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Finding produced while parsing — line is 1-based; `text` is the (comment-stripped) line. */
export interface ParseDiagnostic {
  readonly line: number;
  readonly message: string;
  readonly text: string;
}

export interface ParseResult {
  readonly board: EventStormingBoard;
  readonly diagnostics: readonly ParseDiagnostic[];
}

class IdAllocator {
  private readonly used = new Set<string>();
  /** Explicit `(id …)` — false when the id is already taken (caller reports + allocates). */
  claim(id: string): boolean {
    if (this.used.has(id)) return false;
    this.used.add(id);
    return true;
  }
  alloc(prefix: string, label: string): string {
    const base = `${prefix}_${slug(label)}`;
    let id = base;
    let i = 2;
    while (this.used.has(id)) id = `${base}_${i++}`;
    this.used.add(id);
    return id;
  }
}

/**
 * Line-based keyword parsing; coordinates are `[x, y]` in board pixels (x FIRST), unbounded,
 * optional (default `[0, 0]`). Unknown lines land in `rawPassthrough`.
 */
export function parseDSL(text: string): EventStormingBoard {
  return parseDSLWithDiagnostics(text).board;
}

/**
 * Like `parseDSL`, but additionally returns findings with line numbers (uninterpretable lines,
 * unresolved references) — for editor feedback instead of silent loss.
 */
export function parseDSLWithDiagnostics(text: string): ParseResult {
  const diagnostics: ParseDiagnostic[] = [];
  const ids = new IdAllocator();
  const nameToId = new Map<string, string>();
  const elements: BoardElement[] = [];
  const rawPassthrough: string[] = [];
  const pendingArrows: PendingArrow[] = [];
  const pendingAttachments: PendingAttachment[] = [];

  let config: BoardConfig = { title: 'Untitled Board' };
  let inBlockComment = false;

  const register = (name: string, id: string) => {
    if (!nameToId.has(name)) nameToId.set(name, id);
  };

  // Diagnostics helpers: read the current line/number from the loop state.
  let lineNo = 0;
  let currentLine = '';

  /** Tries to capture a line as an arrow. Returns true when consumed. */
  const pushArrow = (line: string): boolean => {
    // Split off an optional arrow annotation after ';' (e.g. `A -> B; async`).
    const semi = line.indexOf(';');
    const core = semi >= 0 ? line.slice(0, semi).trim() : line;
    const arrowLabel = semi >= 0 ? line.slice(semi + 1).trim() : '';
    const arrow = splitArrow(core);
    if (!arrow) return false;
    pendingArrows.push({
      left: arrow.left,
      right: arrow.right,
      ...(arrowLabel ? { label: arrowLabel } : {}),
      raw: line,
      lineNo,
    });
    return true;
  };
  const diag = (message: string, atLine = lineNo, text_ = currentLine) =>
    diagnostics.push({ line: atLine, message, text: text_ });
  /** Passthrough for a line that looks like a known construct but cannot be parsed. */
  const failed = (l: string) => {
    rawPassthrough.push(l);
    diag('Line could not be interpreted (kept losslessly in rawPassthrough)');
  };
  /** Board pixels, unbounded — no clamping on the free canvas. */
  const pos = (x: number, y: number): Coordinate => ({ x, y });

  const sourceLines = text.split(/\r?\n/);
  for (let i = 0; i < sourceLines.length; i++) {
    const raw = sourceLines[i]!;
    lineNo = i + 1;
    currentLine = raw.trim();
    let working = raw;

    // --- Comments (`//`, `/* */`): strip, but keep losslessly in rawPassthrough. ---
    if (inBlockComment) {
      const close = working.indexOf('*/');
      if (close < 0) {
        rawPassthrough.push(raw);
        continue;
      }
      rawPassthrough.push(working.slice(0, close + 2));
      working = working.slice(close + 2);
      inBlockComment = false;
    }
    let open = indexOfOutsideQuotes(working, '/*');
    while (open >= 0) {
      const close = working.indexOf('*/', open + 2);
      if (close < 0) {
        rawPassthrough.push(working.slice(open));
        working = working.slice(0, open);
        inBlockComment = true;
        break;
      }
      rawPassthrough.push(working.slice(open, close + 2));
      working = `${working.slice(0, open)} ${working.slice(close + 2)}`;
      open = indexOfOutsideQuotes(working, '/*');
    }
    const { code, comment } = splitLineComment(working);
    if (comment !== null) rawPassthrough.push(comment);
    working = code;

    const line = working.trim();
    if (!line) continue;

    const kw = keywordOf(line);
    const after = line.slice(kw.length).trim();

    // Arrows FIRST: sticky NAMES may begin with a keyword word (the default command is
    // named "Command" -> arrow `Command -> X`). Declarations carry coordinates `[...]`,
    // arrows never do — but only the part BEFORE the `;` annotation counts, the annotation
    // is free text and may contain a tuple. Without this pre-detection `Command -> X` would
    // be misread as a (broken) `command` declaration and vanish on re-import. `title` is
    // exempt (its content may itself use `->`) UNLESS the left side is an already-declared
    // sticky name (e.g. one named "Title Page" — declarations always precede arrows in
    // serialized DSL). `style`/`level`/`line` need no exemption: style and level values are
    // single words and drawings always carry coordinate tuples.
    const semi = line.indexOf(';');
    const beforeAnnotation = semi >= 0 ? line.slice(0, semi) : line;
    const titleAsArrow = (): boolean => {
      const arrow = splitArrow(beforeAnnotation.trim());
      return arrow !== null && nameToId.has(decodeName(arrow.left));
    };
    if ((kw !== 'title' || titleAsArrow()) && !parseCoords(beforeAnnotation) && pushArrow(line)) {
      continue;
    }

    switch (kw) {
      case 'title':
        config = { ...config, title: after };
        break;

      case 'style': {
        const s = after.toLowerCase();
        if (KNOWN_STYLES.has(s)) config = { ...config, style: s as 'classic' | 'dark' };
        else failed(line);
        break;
      }

      case 'level': {
        const l = after.toLowerCase();
        if (KNOWN_LEVELS.has(l)) config = { ...config, level: l as BoardLevel };
        else failed(line);
        break;
      }

      case 'event':
      case 'command':
      case 'actor':
      case 'aggregate':
      case 'policy':
      case 'readmodel':
      case 'external':
      case 'hotspot': {
        const node = parseSticky(after);
        if (!node) {
          failed(line);
          break;
        }
        if (node.idInvalid) {
          diag(
            `Id: could not read "${node.idInvalid.trim()}" — expected (id <id>) with letters, digits, '_' or '-'`,
          );
        }
        const explicit = node.id !== undefined && ids.claim(node.id) ? node.id : undefined;
        if (node.id !== undefined && explicit === undefined) {
          diag(`Id: "${node.id}" is already taken — the element got a fresh id`);
        }
        const id = explicit ?? ids.alloc(STICKY_ID_PREFIXES[kw as ElementType]!, node.name);
        elements.push(
          compact({
            id,
            elementType: kw as ElementType,
            label: node.name,
            position: pos(node.coords.x, node.coords.y),
            color: node.color,
          }) as BoardElement,
        );
        register(node.name, id);
        if (node.host !== undefined) {
          if (ATTACHABLE_KINDS.has(kw)) {
            pendingAttachments.push({
              index: elements.length - 1,
              host: node.host,
              raw: line,
              lineNo,
            });
          } else {
            diag(`Attachment: a ${kw} cannot be pinned — only actor/hotspot support (on …)`);
          }
        }
        if (node.sizeSuffix) {
          diag(`Size: a ${kw} cannot be resized — only notes support (size …)`);
        }
        break;
      }

      case 'note': {
        const split = splitAtCoords(after);
        if (!split && after.includes('[')) {
          failed(line);
          break;
        }
        // Color/size ONLY from the suffix after the coordinates (mirrors parseSticky) — notes
        // are free text, so `(color …)` or `(size 1x1)` may legitimately appear inside it.
        const sz = parseSize(split ? split.suffix : after);
        const idp = parseId(sz.rest);
        const col = parseColor(idp.rest);
        if (sz.invalid) {
          diag(
            `Size: could not read "${sz.invalid.trim()}" — expected (size <w>x<h>) with positive numbers`,
          );
        }
        if (idp.id !== undefined || idp.invalid) {
          diag('Id: a note cannot be referenced — only sticky kinds support (id …)');
        }
        // Literal `\n` back into real line breaks (multi-line notes).
        const textPart = decodeName((split ? split.name : col.rest).trim());
        const id = ids.alloc('note', textPart || 'note');
        const note: NoteElement = compact({
          id,
          elementType: 'note',
          label: textPart,
          position: split ? pos(split.coords.a, split.coords.b) : pos(0, 0),
          color: col.color,
          size: sz.size,
        }) as NoteElement;
        elements.push(note);
        break;
      }

      case 'line': {
        // Project extension (freeform drawing): `line [[x,y], [x,y], …] (closed) (dashed) (color x)`.
        const col = parseColor(after);
        const multi = parseMultiCoords(col.rest);
        if (!multi || multi.tuples.length < 2) {
          failed(line);
          break;
        }
        const szDrawing = parseSize(multi.rest);
        if (szDrawing.size || szDrawing.invalid) {
          diag('Size: a drawing cannot be resized — only notes support (size …)');
        }
        const idDrawing = parseId(multi.rest);
        if (idDrawing.id !== undefined || idDrawing.invalid) {
          diag('Id: a drawing cannot be referenced — only sticky kinds support (id …)');
        }
        const flags = multi.rest.toLowerCase();
        const strokeStyle: DrawingStrokeStyle | undefined = flags.includes('(dashed)')
          ? 'dashed'
          : flags.includes('(dotted)')
            ? 'dotted'
            : undefined;
        const points = multi.tuples.map((t) => pos(t.a, t.b));
        const drawing: DrawingElement = {
          id: ids.alloc('draw', 'line'),
          elementType: 'drawing',
          label: '',
          position: points[0]!,
          points,
          ...(flags.includes('(closed)') ? { closed: true } : {}),
          ...(strokeStyle ? { strokeStyle } : {}),
          ...(col.color ? { color: col.color } : {}),
        };
        elements.push(drawing);
        break;
      }

      default: {
        // Unknown keyword: try as an arrow (e.g. `A -> B; async`), otherwise keep raw.
        if (!pushArrow(line)) rawPassthrough.push(line);
      }
    }
  }

  // Reference resolution for arrow endpoints and `(on …)` hosts: a `#`-prefixed token is an id
  // reference (ids exist for EVERY element, not only those declared with `(id …)`); anything
  // else stays a label lookup. No fallback across the two — `#` always means id.
  const resolve = (token: string): BoardElement | undefined => {
    if (token.startsWith('#')) {
      const id = token.slice(1);
      return elements.find((e) => e.id === id);
    }
    const id = nameToId.get(decodeName(token));
    return id !== undefined ? elements.find((e) => e.id === id) : undefined;
  };

  // Deferred like arrows so a host may be declared after its attacher. On failure the sticky
  // stays WITHOUT attachedTo (it was already created above) — no rawPassthrough, the line is
  // otherwise fully represented.
  for (const att of pendingAttachments) {
    const host = resolve(att.host);
    if (!host) {
      diag(`Attachment: "${att.host}" not found`, att.lineNo, att.raw);
      continue;
    }
    if (!HOST_KINDS.has(host.elementType)) {
      diag(
        `Attachment: "${att.host}" is a ${host.elementType} — actors/hotspots may only attach to host stickies`,
        att.lineNo,
        att.raw,
      );
      continue;
    }
    elements[att.index] = { ...elements[att.index]!, attachedTo: host.id } as BoardElement;
  }

  let arrowN = 0;
  // An explicit `(id arrow_N)` on a sticky may occupy an arrow-id slot — skip it (diagram-js
  // has ONE id namespace for shapes and connections; validateBoard rejects the collision).
  const elementIds = new Set(elements.map((e) => e.id));
  const nextArrowId = (): string => {
    let id = `arrow_${++arrowN}`;
    while (elementIds.has(id)) id = `arrow_${++arrowN}`;
    return id;
  };
  const edges: BoardEdge[] = [];
  for (const arrow of pendingArrows) {
    const from = resolve(arrow.left);
    const to = resolve(arrow.right);
    if (!from || !to) {
      rawPassthrough.push(arrow.raw);
      diag(
        `Arrow: ${!from ? `"${arrow.left}"` : `"${arrow.right}"`} not found`,
        arrow.lineNo,
        arrow.raw,
      );
      continue;
    }
    // Only reachable via `#id` refs (labels are registered for sticky kinds only) — an edge to
    // a note/drawing would make validateBoard throw, so it is dropped losslessly instead.
    const nonSticky = !STICKY_KINDS.has(from.elementType)
      ? ([arrow.left, from] as const)
      : !STICKY_KINDS.has(to.elementType)
        ? ([arrow.right, to] as const)
        : undefined;
    if (nonSticky) {
      rawPassthrough.push(arrow.raw);
      diag(
        `Arrow: "${nonSticky[0]}" is a ${nonSticky[1].elementType} — arrows may only connect stickies`,
        arrow.lineNo,
        arrow.raw,
      );
      continue;
    }
    edges.push(
      compact({
        id: nextArrowId(),
        edgeType: 'arrow',
        from: from.id,
        to: to.id,
        label: arrow.label,
      }) as BoardEdge,
    );
  }

  const board = compact({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    config,
    elements,
    edges,
    rawPassthrough: rawPassthrough.length ? rawPassthrough : undefined,
  }) as EventStormingBoard;

  return { board: validateBoard(board), diagnostics };
}

interface ParsedSticky {
  readonly name: string;
  readonly coords: { x: number; y: number };
  /** Color override `(color …)` — supported on every element line. */
  readonly color?: string;
  /** Attachment `(on <Host Name>)` — host name still undecoded, resolved by the caller. */
  readonly host?: string;
  /** Explicit `(id …)` — the caller claims it (duplicate ⇒ diagnostic + fresh id). */
  readonly id?: string;
  /** The matched `(id …)` text when present but unreadable (illegal charset). */
  readonly idInvalid?: string;
  /** A `(size …)` suffix appeared — only notes support it, the caller reports a diagnostic. */
  readonly sizeSuffix?: boolean;
}

/**
 * Parses `<name> [x, y] [(color …)] [(id …)] [(on …)]`. The suffixes are looked up ONLY AFTER
 * the coordinates — parentheses inside the name stay untouched. `(on …)` is extracted first
 * (its host name runs to the final `)` and may itself contain a `(color …)`, `(id …)` or
 * `(size …)`). Coordinates are optional and default to `[0, 0]`; a malformed tuple (bracket
 * present but unreadable) is rejected so the caller can report a diagnostic instead of
 * swallowing it into the name.
 */
function parseSticky(after: string): ParsedSticky | null {
  const split = splitAtCoords(after);
  if (split) {
    if (!split.name) return null;
    const on = parseOn(split.suffix);
    const idp = parseId(on.rest);
    const sz = parseSize(idp.rest);
    const col = parseColor(sz.rest);
    return compact({
      name: decodeName(split.name),
      coords: { x: split.coords.a, y: split.coords.b },
      color: col.color ?? undefined,
      host: on.host,
      id: idp.id,
      idInvalid: idp.invalid,
      sizeSuffix: sz.size || sz.invalid ? true : undefined,
    }) as ParsedSticky;
  }
  if (after.includes('[')) return null;
  const on = parseOn(after);
  const idp = parseId(on.rest);
  const sz = parseSize(idp.rest);
  const col = parseColor(sz.rest);
  const name = col.rest.trim();
  if (!name) return null;
  return compact({
    name: decodeName(name),
    coords: { x: 0, y: 0 },
    color: col.color ?? undefined,
    host: on.host,
    id: idp.id,
    idInvalid: idp.invalid,
    sizeSuffix: sz.size || sz.invalid ? true : undefined,
  }) as ParsedSticky;
}
