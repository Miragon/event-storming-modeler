# `.storm` — exhaustive grammar

Reference for the parser in `@miragon/event-storming-dsl` (`packages/dsl/src/{lexer,parser,serializer}.ts`
in the [event-storming-modeler](https://github.com/Miragon/event-storming-modeler) monorepo). Where
this file and the implementation disagree, the implementation wins — the behaviours below were
verified against it.

## File model

A `.storm` file is a sequence of lines. Line endings may be `\n` or `\r\n`. There is no nesting and
no significant indentation; leading and trailing whitespace on a line is ignored.

Each line is classified in this order:

1. **Block comment continuation** — if a `/*` is still open, everything up to the next `*/` is
   comment.
2. **Comment stripping** — `/* … */` spans and a trailing `// …` are removed from the line and
   pushed to `rawPassthrough`.
3. **Blank** — an empty remainder is skipped entirely (and _not_ preserved).
4. **Arrow pre-detection** — see below.
5. **Keyword dispatch** — `title`, `style`, `level`, the eight sticky kinds, `note`, `line`.
6. **Fallback** — try once more as an arrow; otherwise keep the line verbatim in `rawPassthrough`.

The resulting board is validated (`validateBoard`, Zod plus cross-field invariants) before it is
returned. Parsing itself never throws: everything unreadable was already diverted to
`rawPassthrough` by then.

## Arrow pre-detection (the important precedence rule)

A line is taken as an **arrow** before keyword dispatch when all of these hold:

- the part **before the first `;`** contains no `[x, y]` tuple, **and**
- that part contains `->` with a non-empty side on each end, **and**
- the first word is not `title` — unless the text left of `->` is an already-declared sticky label.

This exists because sticky labels may begin with a keyword. A sticky named `Command` produces
`Command -> Place Order`, which without the pre-check would be misread as a broken `command`
declaration and vanish. `style`, `level` and `line` need no exemption (their values are single words
or always carry coordinates); `title` does, because a title may legitimately contain `->`.

Consequences:

- A label containing `->` is unusable in a declaration line. The serializer rewrites it to `→`.
- An arrow annotation after `;` is free text and may contain a `[1, 2]` tuple without turning the
  line back into a declaration.

## Config statements

```
title <free text>
style classic|dark
level big-picture|process|design
```

- `title` takes the rest of the line verbatim. Absent ⇒ `Untitled Board`.
- `style` and `level` are matched case-insensitively and canonicalised to lowercase. An unknown
  value is **not** an error: the line goes to `rawPassthrough` with a diagnostic.
- The serializer emits them in the order `title`, `style`, `level`, each only when present. A
  `rawPassthrough` line whose first word is an already-emitted config keyword is dropped, so an
  unparsable `style` line cannot produce a contradictory duplicate.
- `level` is a creation filter only, never a validation rule:

  | Level         | Sticky kinds offered                                                   |
  | ------------- | ---------------------------------------------------------------------- |
  | `big-picture` | event, actor, external, hotspot                                        |
  | `process`     | event, command, actor, policy, readmodel, external, hotspot            |
  | `design`      | event, command, actor, aggregate, policy, readmodel, external, hotspot |

  `note` and `drawing` are annotations and always available.

## Sticky declarations

```
<kind> <Label> [x, y] (color …) (id …) (on <Host Label>)
```

`<kind>` ∈ `event` `command` `actor` `aggregate` `policy` `readmodel` `external` `hotspot`.

- The label is everything between the keyword and the coordinate tuple, trimmed. It may contain
  spaces, punctuation and parentheses.
- Coordinates are optional. Missing ⇒ `[0, 0]` (written back explicitly). A tuple that is present
  but malformed (`[` without a readable pair) rejects the line into `rawPassthrough` rather than
  swallowing it into the label.
- Suffixes are only looked up **after** the tuple, and in this extraction order: `(on …)` first
  (its host name runs to the final `)`, so it may itself contain other suffix-looking text), then
  `(id …)`, `(align …)`, `(size …)`, `(color …)`.
- `(size …)` and `(align …)` on a sticky are ignored with a diagnostic — they are note-only.
- `(on …)` on a non-attachable kind is ignored with a diagnostic. Only `actor`, `hotspot` and `note`
  are attachable.

### `(color …)`

`(color #rgb)` … `(color #rrggbbaa)` (3–8 hex digits) or a CSS colour name (`(color green)`).
Case-insensitive keyword, value kept as written. Supported on every element kind including notes and
drawings.

### `(id …)`

Charset `[A-Za-z0-9_-]+` — deliberately tight so an id can never collide with the line grammar.

- Ids exist for **every** element whether or not they appear in the text. Auto-allocated as
  `<prefix>_<slug(label)>`, with a `_2`, `_3`, … suffix on collision. Prefixes: `event`, `cmd`,
  `actor`, `agg`, `policy`, `read`, `ext`, `hot`, `note`, `draw`. `slug` lowercases and replaces
  every run of non-alphanumerics with `_`.
- The serializer writes `(id …)` **only** when it is needed: the element's serialized name is shared
  by two or more stickies, or it literally starts with `#`. An explicit but unnecessary id is
  accepted on parse and dropped again on the next serialize.
- A malformed id yields a diagnostic; a duplicate id yields a diagnostic and the element gets a
  fresh one.
- Notes and drawings cannot carry `(id …)` — they are never referenced. Attempting it is a
  diagnostic.
- Elements and arrows share one id namespace (diagram-js has a single element registry). Arrow ids
  are `arrow_1`, `arrow_2`, … skipping any value an element already occupies.

### `(on <Host Label>)`

Pins `actor` / `hotspot` / `note` onto a host sticky, so it moves with the host. The pinned element
keeps its own absolute `position` — pinning adds behaviour, it does not change how coordinates are
stored.

- Host kinds: `event`, `command`, `aggregate`, `policy`, `readmodel`, `external`. Attachable kinds
  and drawings are never hosts, so attach chains cannot exist.
- The host is referenced by label or by `#id`, and resolved **after** the whole file is read — a
  host may be declared below its attacher.
- An unresolved host, or a host of the wrong kind, produces a diagnostic; the element is still
  created, just unpinned. The line is _not_ duplicated into `rawPassthrough` (it is otherwise fully
  represented).
- Always the last suffix: the parser reads the host name up to the line's **final** `)`.

## Note declarations

```
note <Text> [x, y] (color …) (size <w>x<h>) (align <h> <v>) (on <Host Label>)
```

- `(size …)` — positive numbers, board pixels. Absent = the note auto-sizes to its text (minimum
  180 × 110). The serializer writes no spaces around the `x`; the parser tolerates them. A malformed
  or non-positive size is a diagnostic and is ignored.
- `(align …)` — `left|center|right` then `top|middle|bottom`, both words always together. The
  serializer emits the suffix only when at least one axis differs from the default `left top`, so
  unaligned boards stay byte-identical. `(align left top)` and no suffix are the same board.
- Note text supports a tiny Markdown subset rendered on the canvas: `**bold**`, `*italic*`,
  `***bold italic***` inline runs, and lines starting with `- ` as bullets. Everything else,
  including unmatched markers, stays literal. Stickies are always plain text. The markers live
  inside the label string, so they survive every round-trip.
- Notes are never arrow endpoints. `->` inside note text is therefore safe and is _not_ rewritten.

## Drawing declarations

```
line [[x,y], [x,y], …] (closed) (dashed|dotted) (color …)
```

- At least two points; absolute board pixels. `position` mirrors the first point.
- `(closed)` closes the polyline into a polygon. Stroke styles: `solid` (default, never emitted),
  `dashed`, `dotted`.
- `(on …)`, `(id …)`, `(size …)` and `(align …)` on a drawing are ignored with a diagnostic.

## Arrows

```
<From> -> <To>
<From> -> <To>; <annotation>
```

- Split at the **first** `->`; the annotation is everything after the first `;`, trimmed. An empty
  annotation is dropped.
- Endpoints resolve by label, or by `#id` when the token starts with `#`. `#` _always_ means id —
  there is no fallback to a label lookup, and no fallback from a label to an id.
- Label lookup is registered per sticky kind, **first declaration wins**. Notes and drawings are not
  registered, so they are unreachable by label.
- Resolution happens after the whole file is read, so an arrow may precede its endpoints.
- An unresolved endpoint, or an endpoint that resolves to a note or drawing, produces a diagnostic
  and the **whole line** is kept in `rawPassthrough` — the arrow does not exist on the board.

## Comments

- `// …` to end of line. The scanner is:
  - **URL-aware** — `//` immediately after `:` is a scheme separator, not a comment, so
    `https://example.com` survives.
  - **Quote-aware** — an apostrophe `'` toggles "inside quotes", and `//` inside quotes is not a
    comment. A single `'` in a label therefore suppresses comment detection for the rest of that
    line: `note It's fine // really` keeps `// really` as note text.
- `/* … */` blocks, possibly spanning lines. Block-comment scanning is quote-aware too.
- Comments never produce diagnostics.
- **Placement is not preserved.** Comments go to `rawPassthrough`, which the serializer appends at
  the very end of the file, after the arrows — in source order. Use `note` elements for anything
  that must stay anchored to a sticky.

## Escaping on serialize

Applied to every label written into the line-based grammar:

| Input        | Written as    | Why                                                     |
| ------------ | ------------- | ------------------------------------------------------- |
| real newline | `\n`          | the grammar is line-based                               |
| `//`         | `∕∕` (U+2215) | would otherwise be stripped as a comment — `://` exempt |
| `/*`         | `∕*`          | would otherwise open a block comment                    |
| `->`         | `→` (U+2192)  | **names only** — would otherwise be read as an arrow    |

Note _text_ is not arrow-escaped (notes are never arrow endpoints). On parse, only `\n` is decoded
back; the U+2215 / U+2192 substitutions are permanent, by design.

Empty labels are replaced on serialize by the per-kind default: `Domain Event`, `Command`, `Actor`,
`Aggregate`, `Policy`, `Read Model`, `External System`, `Hotspot`.

Coordinates are rounded to 3 decimals and never written in exponent notation.

## Serializer output order

```
title
style          (only when set)
level          (only when set)
<elements, in board order, one line each>
<arrows, in board order, one line each>
<rawPassthrough, verbatim, in source order>
```

Trailing newline at the end of the file.

## Round-trip guarantee

`serialize(parse(text))` is **canonical** text, and canonical text is a fixed point:
`parse → serialize → parse → serialize` is byte-identical. What the first canonicalisation changes:

- blank lines are removed;
- comments move to the end of the file;
- missing coordinates become explicit `[0, 0]`;
- coordinates are rounded to 3 decimals;
- unnecessary `(id …)` suffixes are dropped, necessary ones added (and arrows rewritten to `#id`);
- `(align left top)` is dropped;
- labels are escaped as above;
- elements are emitted before arrows.

Everything else — labels, colours, sizes, pins, unknown lines, comment text — survives unchanged.

## Diagnostics catalogue

`parseDSLWithDiagnostics(text)` returns `{ board, diagnostics }`, each diagnostic
`{ line, message, text }` with a 1-based line number and the comment-stripped source line.
Diagnostics from the line scan come first, then attachment diagnostics, then arrow diagnostics.

| Message                                                              | Cause                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Line could not be interpreted (kept losslessly in rawPassthrough)`  | unknown `style`/`level` value, malformed coordinates, a `line` with < 2 points, an empty label |
| `Id: could not read "…"`                                             | `(id …)` outside `A-Za-z0-9_-`                                                                 |
| `Id: "…" is already taken — the element got a fresh id`              | duplicate explicit id                                                                          |
| `Id: a note cannot be referenced` / `a drawing cannot be referenced` | `(id …)` on a note or drawing                                                                  |
| `Size: a <kind> cannot be resized`                                   | `(size …)` on a non-note                                                                       |
| `Size: could not read "…"`                                           | malformed or non-positive `(size …)`                                                           |
| `Align: a <kind> cannot be aligned`                                  | `(align …)` on a non-note                                                                      |
| `Align: could not read "…"`                                          | unknown axis words in `(align …)`                                                              |
| `Attachment: a <kind> cannot be pinned`                              | `(on …)` on something other than actor/hotspot/note                                            |
| `Attachment: "…" not found`                                          | unresolved host                                                                                |
| `Attachment: "…" is a <kind>`                                        | host is not a host kind                                                                        |
| `Arrow: "…" not found`                                               | unresolved endpoint — the arrow does not exist                                                 |
| `Arrow: "…" is a <kind> — arrows may only connect stickies`          | endpoint resolves to a note or drawing                                                         |

An empty `diagnostics` array is the practical definition of "this file is clean".
