# `@miragon/event-storming-dsl` — API

```bash
npm install @miragon/event-storming-dsl
```

DOM-free (no `diagram-js`, no `window`/`document`), so it runs in Node, a worker or the browser.
ESM, TypeScript types included.

## Text ↔ board

```ts
import { parseDSL, parseDSLWithDiagnostics, serializeDSL } from '@miragon/event-storming-dsl';

const board = parseDSL(stormText); // EventStormingBoard
const text = serializeDSL(board); // canonical .storm text, trailing newline included
```

`parseDSL` never throws on malformed DSL — unreadable lines are diverted into
`board.rawPassthrough`. (It _can_ throw if the resulting board violates a cross-field invariant,
which hand-written text cannot normally produce.)

## Checking generated text

This is the reliable way to validate a board you just wrote:

```ts
const { board, diagnostics } = parseDSLWithDiagnostics(stormText);

for (const d of diagnostics) {
  console.error(`${d.line}: ${d.message}\n  ${d.text}`);
}
```

```ts
interface ParseDiagnostic {
  readonly line: number; // 1-based
  readonly message: string;
  readonly text: string; // the comment-stripped source line
}
```

An empty `diagnostics` array means every line was understood. A non-empty one does **not** mean the
parse failed — the board is still usable, some lines just did not become elements or arrows. See the
catalogue in `grammar.md`.

Round-trip check, useful as a self-test after generating a board:

```ts
const canonical = serializeDSL(parseDSL(stormText));
const stable = serializeDSL(parseDSL(canonical)) === canonical; // always true
```

Comparing `canonical` against your own text shows exactly what the canonicaliser changed — dropped
blank lines, relocated comments, added or removed `(id …)`, escaped labels.

## The board model

From `@miragon/event-storming-schema-model`, re-exported for convenience:

```ts
interface EventStormingBoard {
  readonly schemaVersion: number;
  readonly config: { title: string; style?: 'classic' | 'dark'; level?: BoardLevel };
  readonly elements: readonly BoardElement[];
  readonly edges: readonly BoardEdge[]; // { id, edgeType: 'arrow', from, to, label? }
  readonly rawPassthrough?: readonly string[];
}
```

`BoardElement` is a discriminated union on `elementType`, with `id`, `label`, `position` (the
element's **centre**) and an optional `color`. `actor`, `hotspot` and `note` may carry `attachedTo`;
`note` may carry `size` and `align`; `drawing` carries `points`, `closed` and `strokeStyle`.

Everything is `readonly` — the model is a serialization format, not an editing structure. Build a
new board rather than mutating one, or use the pure transforms in
`@miragon/event-storming-transforms`.

## JSON bridge

```ts
import { boardToJSON, boardFromJSON, loadBoard } from '@miragon/event-storming-dsl';

const json = boardToJSON(board); // deterministic JSON string
const back = boardFromJSON(json); // validated EventStormingBoard
const any = loadBoard(unknownValue); // validate + migrate an older schemaVersion
```

`boardFromJSON` / `loadBoard` validate against the Zod schema and **do** throw on invalid input —
unlike `parseDSL`.

## Related packages

| Package                                | Purpose                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| `@miragon/event-storming-schema-model` | the metamodel, Zod validation, timeline sort, JSON serialization |
| `@miragon/event-storming-transforms`   | pure `board → board` transforms (move, …)                        |
| `@miragon/event-storming-renderer`     | diagram-js viewer/editor, import/export, CSS                     |
