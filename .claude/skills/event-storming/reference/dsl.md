# The `.storm` DSL

The text format this project reads and writes (packages/dsl). Line-based, one statement per line.
Parsing never throws: unknown or unparsable lines are preserved verbatim (raw passthrough) and
survive round-trips, so hand-written comments and future keywords are safe. Serialization is
deterministic — the same board always produces the same text.

## Config statements

| Statement                                    | Meaning                                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `title <text>`                               | Board title.                                                                                             |
| `style classic` \| `dark`                    | Optional board style.                                                                                    |
| `level big-picture` \| `process` \| `design` | Optional workshop level (see `concepts.md`) — filters which sticky kinds the editor offers for creation. |
| `// comment`                                 | Comment — kept verbatim on round-trip.                                                                   |

The serializer emits config statements in the order `title`, `style`, `level` (each only when
present). An absent `level` means `design` — everything available. The level filters only the
creation surfaces (palette, typed append, change-type popup); elements of any kind stay valid
and editable on every level, so a board opened at a lower level never breaks:

```
title Payments Big Picture
level big-picture

event Payment Received [620, 300]
hotspot Who reconciles refunds? [800, 520]
```

An invalid level value is not an error: the line is kept verbatim in the raw passthrough and
reported as a diagnostic.

## Element statements

```
<kind> <Name> [x, y]
<kind> <Name> [x, y] (color #rrggbb)
<kind> <Name> [x, y] (color #rrggbb) (id <id>) (on <Host Name>)
note <Text> [x, y] (color #rrggbb) (size <w>x<h>) (on <Host Name>)
```

- `<kind>` is one of: `event`, `command`, `actor`, `aggregate`, `policy`, `readmodel`,
  `external`, `hotspot`, `note`.
- `<Name>` is free text (may contain spaces and keywords — the parser distinguishes declarations
  from edges by the trailing `[x, y]` coordinates).
- `[x, y]` — **pixel** coordinates of the sticky's **center**, `x` first. Optional (defaults to
  `[0, 0]`). Any finite number is allowed, including negatives; values are rounded to 3 decimals.
- `(color #hex)` — optional per-sticky color override.
- `(id <id>)` — the sticky's internal id (letters, digits, `_`, `-`); sticky kinds only, notes
  and drawings are never referenced. The serializer writes it only when the name alone would be
  ambiguous (two or more stickies share the label) or the label starts with `#`; an explicit
  but unneeded id is accepted and dropped again on the next serialize. A malformed or duplicate
  id is reported as a diagnostic and the element gets a freshly allocated id.
- `(on <Host Name>)` — `actor`/`hotspot`/`note` only: pins the element onto the named host
  sticky (`event`, `command`, `aggregate`, `policy`, `readmodel` or `external`); it then moves
  together with the host while keeping its own absolute coordinates. Always the **last** suffix —
  the host name runs to the line's final `)`, so names containing parentheses work. An unresolved
  or invalid host is reported as a diagnostic and the element stays unpinned.
- `(size <w>x<h>)` — `note` only: the note's manual size in board pixels (the note was resized
  by hand). Absent = the note auto-sizes to its text. Always the last suffix before `(on …)` on
  note lines; the serializer writes no spaces around the `x`, the parser tolerates them. A
  malformed size, or a size on any other kind, is reported as a diagnostic and ignored — the
  element is still created.

```
command Approve Order [240, 300]
actor Manager [250, 280] (on Approve Order)
note Kickoff agenda [80, 80] (size 240x160)
note Check with legal first [250, 340] (on Approve Order)
```

Freeform drawings use `line` with a list of points and optional suffixes:

```
line [[100,100],[200,150],[180,240]] (dashed)
line [[0,0],[50,0],[50,50]] (closed)
```

Stroke styles: `solid` (default), `dashed`, `dotted`; `closed` closes the polyline.

## Edge statements (arrows)

Edges reference stickies **by name** (or by `#id`) and never carry coordinates:

```
Customer -> Place Order
Order Placed -> When order placed, ship it; async
```

- `A -> B` draws an arrow from sticky `A` to sticky `B`.
- An optional label follows after `;`.
- A `#`-prefixed token always reads as an **id reference** — never a label lookup. It works for
  every sticky's internal id, also ones declared without an `(id …)` suffix; an unresolved id
  is reported as a diagnostic and the line kept losslessly. `(on …)` hosts accept `#id` too.
- Duplicate labels are legal: the serializer references an ambiguous target by `#id` (its
  declaration carries the matching `(id …)` suffix) and replaces `->` inside labels with `→`.

```
aggregate Order [420, 290] (id agg_order)
aggregate Order [1160, 290] (id agg_order_2)

Place Order -> #agg_order
#agg_order -> Order Placed
Ship Order -> #agg_order_2
#agg_order_2 -> Order Shipped
```

## Round-trip guarantee

`serialize(parse(text))` reaches a fixed point after one canonicalization: parse → serialize →
parse → serialize yields byte-identical text. When editing a board file, change only what the user
asked for — everything else (comments, unknown lines, ordering rules) is preserved.

## Worked example

The canonical example board (`example/order-checkout.storm`):

```
title Order Checkout

actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [420, 290] (id agg_order)
event Order Placed [620, 300]
policy When order placed, ship it [800, 300]
command Ship Order [980, 300]
aggregate Order [1160, 290] (id agg_order_2)
event Order Shipped [1340, 300]
readmodel Order Status [620, 120]
external Payment Provider [420, 520]
hotspot Double payment on retry? [620, 520]
note Big-picture session: checkout flow [80, 80]

Customer -> Place Order
Place Order -> #agg_order
Place Order -> Payment Provider
#agg_order -> Order Placed
Order Placed -> Order Status
Order Placed -> When order placed, ship it
When order placed, ship it -> Ship Order
Ship Order -> #agg_order_2
#agg_order_2 -> Order Shipped
```

Reading it: the customer issues `Place Order`; the `Order` aggregate (after consulting the
`Payment Provider`) emits `Order Placed`; a policy reacts and issues `Ship Order`, which produces
`Order Shipped`. `Order Status` is the read model, and the hotspot flags an open retry question.

## Review-note convention

Feedback notes use `note … (color #hex)` with the dark review palette from `SKILL.md`
(`#15803d` good, `#b45309` watch, `#b91c1c` problem, `#1d4ed8` info, `#7e22ce` idea), placed near
the sticky they comment on:

```
note Good: clear pivotal event [620, 180] (color #15803d)
note Missing actor for this command [980, 420] (color #b91c1c)
```
