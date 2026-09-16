---
name: storm-dsl
description: >-
  The `.storm` Event Storming DSL — the line-based text format behind
  `@miragon/event-storming-dsl`: full grammar (config lines, sticky/note/drawing declarations,
  `->` arrows), the `(color …)` `(id …)` `(on …)` `(size …)` `(align …)` suffixes, coordinate
  and layout conventions, escaping rules, parser diagnostics and the round-trip guarantee,
  plus the per-level authoring rules for Brandolini's three workshop formats (`big-picture`,
  `process`, `design`) and the rule that recurring stickies are repeated along the timeline
  rather than reused. Use whenever reading, writing, generating, editing, validating or
  debugging a `.storm` file or board text, converting an Event Storming board to or from text,
  placing stickies on the canvas, or calling `parseDSL` / `parseDSLWithDiagnostics` /
  `serializeDSL`. For the Event Storming *method* (board reviews, facilitation) use the
  `event-storming` skill.
---

# The `.storm` DSL

`.storm` is the text format for Event Storming boards, read and written by
[`@miragon/event-storming-dsl`](https://www.npmjs.com/package/@miragon/event-storming-dsl). It is
line-based: one statement per line, no nesting, no indentation rules. A board is a flat list of
config lines, element declarations and arrows.

Two properties make it safe to generate and edit:

- **Parsing never throws.** A line the parser cannot interpret is kept verbatim (`rawPassthrough`)
  and re-emitted — a syntax mistake degrades into a preserved comment, it never destroys the board.
- **Serializing is deterministic and reaches a fixed point after one pass.** `parse → serialize →
parse → serialize` is byte-identical, so text you write is directly comparable with what the
  editor writes back.

Scope: this skill is about the **format**. Which sticky kind belongs where, and how to critique a
board, is the `event-storming` skill's job.

## The grammar on one page

### Config — at most one of each, anywhere in the file

| Line                                         | Meaning                                             |
| -------------------------------------------- | --------------------------------------------------- |
| `title <free text>`                          | Board title. Default when absent: `Untitled Board`. |
| `style classic` \| `style dark`              | Board style. Optional.                              |
| `level big-picture` \| `process` \| `design` | Workshop level. Optional; absent means `design`.    |

`level` only filters which sticky kinds the editor _offers for creation_ — it is never a validation
rule, and a board opened at a lower level keeps every element it has. What to actually emit per
level: see **Workshop levels** below.

### Elements

```
<kind> <Label> [x, y] (color …) (id …) (on <Host>)
note   <Text>  [x, y] (color …) (size <w>x<h>) (align <h> <v>) (on <Host>)
line   [[x,y], [x,y], …] (closed) (dashed|dotted) (color …)
```

| Keyword     | Sticky                | Box (w × h) | Notes                                        |
| ----------- | --------------------- | ----------- | -------------------------------------------- |
| `event`     | Domain event, orange  | 130 × 90    | Past tense: `Order Placed`                   |
| `command`   | Command, blue         | 130 × 90    | Imperative: `Place Order`                    |
| `actor`     | Actor, small yellow   | 100 × 65    | Pinnable via `(on …)`                        |
| `aggregate` | Aggregate, yellow     | 180 × 110   | `design` level                               |
| `policy`    | Policy, lilac         | 180 × 110   | Reads "whenever X, do Y"                     |
| `readmodel` | Read model, green     | 130 × 90    |                                              |
| `external`  | External system, pink | 180 × 110   |                                              |
| `hotspot`   | Hotspot, red          | 130 × 90    | Pinnable via `(on …)`                        |
| `note`      | Free-text note, grey  | ≥ 180 × 110 | Not an arrow endpoint; pinnable via `(on …)` |
| `line`      | Freeform drawing      | —           | ≥ 2 points; not an arrow endpoint            |

The label is free text and may contain spaces, punctuation, parentheses and even keywords — the
parser tells a declaration from an arrow by the trailing `[x, y]`, not by the words.

### Arrows

```
<From> -> <To>
<From> -> <To>; <annotation>
```

Endpoints are referenced **by label**, or by `#id` when a label is ambiguous. Arrows carry no
coordinates and may only connect the eight sticky kinds — never a note or a drawing.

### Suffixes

All suffixes are read **only after the coordinates**, so `(color …)` inside a label is safe text.

| Suffix              | Allowed on                 | Meaning                                                                 |
| ------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `(color #rrggbb)`   | every element              | Colour override. Hex (3–8 digits) or a CSS colour name.                 |
| `(id <id>)`         | the 8 sticky kinds         | Internal id, charset `A-Za-z0-9_-`. Only needed to disambiguate labels. |
| `(on <Host Label>)` | `actor`, `hotspot`, `note` | Pins onto a host sticky; it then moves with the host. **Always last.**  |
| `(size <w>x<h>)`    | `note`                     | Manual box size. Absent = auto-size to the text.                        |
| `(align <h> <v>)`   | `note`                     | `left\|center\|right` + `top\|middle\|bottom`. Default `left top`.      |

Canonical order: `(color …) (id …) (on …)` on stickies, `(color …) (size …) (align …) (on …)` on
notes. `(on …)` is last because its host name runs to the line's final `)` — that is what lets host
labels contain parentheses.

Hosts must be `event`, `command`, `aggregate`, `policy`, `readmodel` or `external`. Attach chains
are impossible: actors, hotspots, notes and drawings are never hosts.

### Comments

`// line comment` and `/* block comment */` (may span lines). Both are stripped from the board and
preserved in `rawPassthrough` — see "Rules that bite" for where they end up.

## Coordinates

- `[x, y]`, **x first**, in board pixels, and they address the element's **centre**.
- Unbounded — negative and very large values are fine. The canvas is free, there is no grid.
- Optional; a missing tuple means `[0, 0]` and is written back explicitly.
- Rounded to 3 decimals on serialize.

## Workshop levels

Brandolini's three workshop formats, recorded by the `level` statement. The parser accepts every
keyword on every level, so these are **authoring** rules — breaking them produces no diagnostic, it
just makes the board off-level.

|                  | `big-picture`                        | `process`                                  | `design`                                             |
| ---------------- | ------------------------------------ | ------------------------------------------ | ---------------------------------------------------- |
| Keywords         | `event` `actor` `external` `hotspot` | adds `command` `policy` `readmodel`        | adds `aggregate`                                     |
| Backbone         | events only                          | actor → command → event → policy → command | actor → command → **aggregate** → event → policy → … |
| Arrows           | few — x order carries the meaning    | every link explicit                        | every link explicit                                  |
| Always available | `note`, `line`                       | `note`, `line`                             | `note`, `line`                                       |

- **`big-picture`** — the whole business as one timeline of past-tense events. No commands, no
  aggregates, no policies, no read models. Actors and external systems are context in the bands
  above and below, not chained into the flow.
- **`process`** — one process end to end. Every `command` has exactly one issuer (an `actor` or a
  `policy`); every `event` has exactly one source (a `command` or an `external`); an event→command
  hop with no `policy` between them hides an automation or a human decision. Policy labels read as
  sentences: `When order placed, capture payment`.
- **`design`** — insert an `aggregate` between every command and the event it produces. Aggregate
  labels are singular nouns (`Order`, `Payment`), never `…Service` or `…Manager`.

`reference/levels.md` has the statement patterns, the per-level rules and a complete worked board
for each level.

## Laying out a generated board

Coordinates are where generated boards usually go wrong: stickies overlap, or the timeline is not
readable. Use this default grid and the box widths from the table above.

```
y =  120    read models              (above the timeline)
y =  300    the main timeline        actor → command → aggregate → event → policy → …
y =  520    external systems, hotspots (below the timeline)
x pitch ≈ 180 px per step, 200 px next to a 180-wide sticky, 220 px between two of them
```

- Keep at least ~40 px of air between two boxes: a 180 px pitch between two 130-wide stickies leaves
  50 px, 200 px between a 130 and a 180 leaves 45 px, and two 180-wide ones need 220 px — at 200 px
  they are only 20 px apart.
- Swimlanes: give each actor or system its own `y` band, ~220 px apart, and keep the same `x`
  columns across lanes so causally related stickies line up vertically.
- A pinned element keeps its own absolute coordinates — place it _overlapping_ its host, e.g. host
  centre shifted by about `(+10, -25)` for the classic actor-in-the-corner look.
- Notes placed as commentary sit ~120–150 px from the sticky they comment on, so they do not overlap
  it.

`reference/layout.md` has the exact geometry, a full worked board and the review-note colours.

## One sticky = one point in time

A sticky is a **position on the timeline**, not a database row for a concept. If the `Order`
aggregate accepts a command at x = 440 and another one at x = 1180, that is **two aggregate stickies
with the same label** — not one sticky with four arrows converging on it. The same goes for every
kind that recurs: actors, external systems and read models are repeated at each point where they
take part.

Collapsing everything about `Order` onto one sticky is the most common defect in generated boards.
It makes arrows shoot backwards across the canvas and destroys the left-to-right reading, which is
the one thing the board is for.

Two DSL consequences:

- Repeated labels are legal, but a **plain-label reference binds to the first declaration**,
  silently and with no diagnostic. Give every repeated sticky an explicit `(id …)` and reference it
  as `#id`, named after the occurrence (`agg_order_ship`, not `agg_order_2`).
- **Check that no backbone arrow points left** (`from.x < to.x` for every one of them). Off-backbone
  arrows — event → read model, command → external — stay near-vertical inside one x column. An
  arrow running right-to-left means a sticky was reused where it should have been repeated.

`reference/layout.md` has the full wrong/right pair.

## Writing a board

1. **Pick the level first** — it decides which keywords you may use and what the backbone looks
   like. Write `title`, then `style`, then `level`; that is the order the serializer emits, so
   writing it that way keeps your file canonical.
2. **Lay out the event backbone left to right**, past tense, before anything else.
3. **Work backwards from each event** — which command caused it, which aggregate handled it (at
   `design`), which actor or policy issued the command, which read model informed the decision.
   Repeat a sticky at every timeline position where it takes part; never reuse one.
4. **Declare every element before you reference it** (not required by the parser — arrows and hosts
   resolve after the whole file — but it is what the serializer produces and it reads better).
5. **Add arrows last**, one block, in flow order.
6. **Re-read the file as the parser would**: every arrow endpoint must match a declared label
   character for character, or be a `#id` — and every backbone arrow must point right.

## Rules that bite

- **Blank lines are dropped** on round-trip. Use them freely while drafting, but do not rely on them
  for structure.
- **Comments move to the end of the file** on round-trip (in their original order), because they
  live in `rawPassthrough`, which is appended last. A comment does _not_ stay next to the line it
  annotated. Prefer `note` stickies for anything that must stay anchored.
- **A label containing `->` breaks arrow parsing** — a line with `->` and no coordinates is read as
  an arrow. The serializer rewrites `->` inside labels to `→` (U+2192); write `→` yourself.
- **`//` and `/*` inside a label** are rewritten to `∕∕` / `∕*` (U+2215) so they are not stripped as
  comments. `//` directly after `:` is exempt — `https://example.com` survives verbatim.
- **A `'` in a label suppresses comment detection** for the rest of the line (the comment scanner is
  quote-aware). `note It's fine // really` keeps `// really` as part of the note text.
- **Real line breaks in a label** are written as the two characters `\n` and decoded on parse, so a
  multi-line note stays one line in the file.
- **Duplicate labels are legal, and the first declaration wins** for plain name lookups — silently,
  with no diagnostic. Declaring `aggregate Order` twice and writing `Ship Order -> Order` binds the
  arrow to the _first_ `Order`, leaving the second orphaned. Always write `(id …)` + `#id` for
  deliberately repeated stickies. The serializer will add the ids on the next save anyway, but by
  then the arrows already point at the wrong sticky.
- **`#` always means "id"** in a reference position, never a label lookup — and it works for every
  element, including ones declared without an explicit `(id …)`. Auto-ids are
  `<prefix>_<slugified label>`, with prefixes `event`, `cmd`, `actor`, `agg`, `policy`, `read`,
  `ext`, `hot`, `note`, `draw`.
- **A label that literally starts with `#`** forces an `(id …)` suffix on serialize.
- **Empty labels** are replaced by the per-kind default (`Domain Event`, `Command`, `Actor`, …).
- **An unresolved arrow or an unreadable line is not an error** — it lands in `rawPassthrough` and
  is reported as a diagnostic. It also means the arrow silently does not exist on the board, so
  check diagnostics rather than assuming success.

## Editing an existing board

Change only what was asked, and leave everything else byte-identical: unknown lines, comments,
ids, colours and coordinates all round-trip. Append new elements rather than renumbering or
re-sorting existing ones, and do not "tidy" coordinates the user set by hand.

Renaming a sticky means updating **every** reference to it: its arrows and any `(on …)` host name.
An orphaned reference does not fail loudly — it just disappears into `rawPassthrough`.

## Before handing a file back

- Every `<kind>` keyword is one of the ten above, lowercase, at line start.
- Every declaration has `[x, y]` with x first, and no two boxes overlap unintentionally.
- Every arrow endpoint matches a declared label exactly, or a real `#id`.
- No `->`, unescaped `//` or `/*` inside a label; line breaks written as `\n`.
- `(on …)` is the last suffix, and its host is a host kind.
- Notes and drawings are not used as arrow endpoints.
- Every backbone arrow points right; every repeated label carries an `(id …)` and is referenced by
  `#id`.
- The keywords used match the board's `level`.
- If you can run it: `parseDSLWithDiagnostics(text).diagnostics` must be empty — that is the real
  check. See `reference/api.md`.

## Reference files (read on demand)

- `reference/grammar.md` — the exhaustive spec: every statement and suffix, parser precedence,
  escaping, comment handling, id allocation, the full diagnostics catalogue, round-trip rules.
- `reference/levels.md` — the three Event Storming levels: allowed keywords, statement patterns and
  authoring rules per level, plus a complete worked board for each.
- `reference/layout.md` — box geometry, the coordinate grid, swimlanes, pinning offsets, a full
  worked board and the review-note colour convention.
- `reference/api.md` — the programmatic API: `parseDSL`, `parseDSLWithDiagnostics`, `serializeDSL`,
  the JSON bridge, and how to validate generated text.
