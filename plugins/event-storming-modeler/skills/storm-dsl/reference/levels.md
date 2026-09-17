# `.storm` — the three Event Storming levels

Alberto Brandolini describes three formats of the workshop, and a `.storm` board records which one
it is with the optional `level` statement (absent = `design`).

**`level` is a creation filter, not a validation rule.** The parser accepts every keyword on every
level, and elements already on a board stay valid and editable when the level changes — that is
deliberate, so a board opened at a lower level never breaks. So everything below is an **authoring**
rule: what you should emit for a board that claims a level. Breaking it produces no diagnostic; the
board is simply off-level, which is a review finding, not a parse error.

## At a glance

|                     | `big-picture`                         | `process`                                   | `design`                                             |
| ------------------- | ------------------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| Keywords offered    | `event` `actor` `external` `hotspot`  | adds `command` `policy` `readmodel`         | adds `aggregate`                                     |
| Always available    | `note`, `line`                        | `note`, `line`                              | `note`, `line`                                       |
| Backbone            | events only                           | actor → command → event → policy → command  | actor → command → **aggregate** → event → policy → … |
| Arrows              | few — the x order carries the meaning | the point of the level: every link explicit | as `process`, plus command→aggregate→event           |
| Question it answers | "what happens in this business?"      | "how does this one process actually run?"   | "what enforces consistency, and where?"              |
| Typical size        | 15–60 events, one line                | 20–40 stickies, one process end to end      | 15–30 stickies, one slice                            |

## Big Picture — `level big-picture`

The whole business as one timeline of domain events. No commands, no aggregates, no policies, no
read models — introducing them here is the classic way to kill a Big Picture session.

### Statement patterns

```
event    <Past Tense Phrase>   [x, y]
actor    <Role>                [x, y]
external <Third-Party System>  [x, y]
hotspot  <Open Question?>      [x, y]   // (on <Event>) pins it to one sticky — see Rules
note     <Legend or metadata>  [x, y]

<External> -> <Event>           // a system outside our control produced this
```

### Rules

- Every backbone line is an `event`, past tense, ordered strictly left → right.
- Actors and external systems are context, placed in the bands above and below — not chained.
- Arrows are optional and sparse. **Ordering, not arrows, carries the meaning at this level.** Use
  them only where a system boundary is genuinely non-obvious.
- Hotspots are a deliverable, not a defect. Place them in the band below the event they question,
  in the same x column. Pin one with `(on …)` only when it belongs to exactly one sticky — a pinned
  hotspot then sits _overlapping_ its host (see `layout.md`), not in the band.
- Mark pivotal events (phase changes, candidate bounded-context boundaries) with a coloured `note`
  above them rather than a new sticky kind.

### Do not emit

`command`, `aggregate`, `policy`, `readmodel` — if you find yourself needing them, the board wants
to be a `process` board.

### Example

```
title Checkout — Big Picture
level big-picture
actor Customer [200, 140]
event Cart Filled [200, 300]
event Order Placed [400, 300]
event Payment Captured [600, 300]
event Order Shipped [800, 300]
event Order Delivered [1000, 300]
external Payment Provider [600, 520]
external Carrier [800, 520]
hotspot What if payment fails after shipping? [600, 660]
note Pivotal: money has moved [600, 140] (color #1d4ed8)
Payment Provider -> Payment Captured
Carrier -> Order Shipped
```

## Process Modelling — `level process`

One process, end to end, with the full causal grammar except aggregates. This is where arrows stop
being optional: every command needs an issuer and every event needs a source.

### Statement patterns

```
actor     <Role>                          [x, y]
command   <Imperative Phrase>             [x, y]
event     <Past Tense Phrase>             [x, y]
policy    <When X, do Y>                  [x, y]
readmodel <Information Needed To Decide>  [x, y]
external  <Third-Party System>            [x, y]
hotspot   <Open Question?>                [x, y]   // (on <Host>) pins it — see Rules

<Actor>     -> <Command>      // who decides
<Command>   -> <Event>        // what it produces
<Event>     -> <Policy>       // what reacts
<Policy>    -> <Command>      // what it triggers next
<Event>     -> <ReadModel>    // what the event feeds
<ReadModel> -> <Actor>        // what the actor decides on
<Command>   -> <External>     // call out to a system we do not own
<External>  -> <Event>        // a system outside our control produced this
```

### Rules

- The backbone alternates **command → event**, glued by **policies**. An event followed directly by
  a command with no policy between them hides either an automation or a human decision — model it.
- Every `command` has exactly one incoming arrow, from an `actor` or a `policy`.
- Every `event` has exactly one incoming arrow, from a `command` or an `external`.
- A `policy` label reads as a sentence: `When order placed, capture payment`. Not a noun.
- Place a `readmodel` **above the sticky that consumes it** so the informing arrow runs vertically.
  Read models above the event that feeds them are also common — pick one and stay consistent.
- No `aggregate` yet. Aggregates are discovered after the flow is stable; forcing them early is the
  most common way to freeze a wrong design.

### Example

```
title Checkout — Process
level process
actor Customer [80, 300]
readmodel Cart Summary [80, 120]
command Place Order [240, 300]
event Order Placed [440, 300]
policy When order placed, capture payment [640, 300]
command Capture Payment [860, 300]
event Payment Captured [1060, 300]
policy When payment captured, ship it [1260, 300]
command Ship Order [1480, 300]
event Order Shipped [1680, 300]
external Payment Provider [860, 520]
hotspot Retry window? [1060, 520]
Cart Summary -> Customer
Customer -> Place Order
Place Order -> Order Placed
Order Placed -> When order placed, capture payment
When order placed, capture payment -> Capture Payment
Capture Payment -> Payment Provider
Capture Payment -> Payment Captured
Payment Captured -> When payment captured, ship it
When payment captured, ship it -> Ship Order
Ship Order -> Order Shipped
```

## Software Design — `level design`

Zoom into one slice and make the consistency boundaries explicit. The aggregate is inserted between
every command and the event it produces, so the backbone becomes:

```
actor → command → aggregate → event → policy → command → aggregate → event → …
```

### Statement patterns

Everything from `process`, plus:

```
aggregate <Noun>  [x, y] (id <id>)

<Command>   -> <Aggregate>    // the aggregate accepts the command
<Aggregate> -> <Event>        // and emits the event
<Aggregate> -> <External>     // or calls out while handling it
```

### Rules

- **One aggregate sticky per command/event pair.** The same aggregate handling three commands at
  three points in the timeline is three stickies with the same label — see
  "Repeat, never reuse" in `layout.md`. This is the single most common mistake in generated design
  boards.
- Because repeated labels are ambiguous, give every repeated aggregate an explicit `(id …)` and
  reference it as `#id`. A plain-label arrow binds to the **first** declaration silently.
- An aggregate label is a noun, singular, the thing that guarantees the invariant: `Order`,
  `Payment`, `Shipment`. Not `Order Service`, not `Order Manager`.
- If one aggregate accepts every command on the board, that is the "one giant aggregate" smell —
  split it along the events it actually needs to keep consistent.
- The read model / external system / hotspot bands work exactly as at `process` level.

### Example

`Order` appears twice — once accepting `Place Order`, once accepting `Ship Order` — so both carry
an id and the arrows use `#id`:

```
title Checkout — Design
level design
actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [440, 290] (id agg_order)
event Order Placed [640, 300]
readmodel Order Status [640, 120]
policy When order placed, capture payment [840, 300]
command Capture Payment [1060, 300]
aggregate Payment [1260, 290]
event Payment Captured [1460, 300]
external Payment Provider [1260, 520]
hotspot Double capture on retry? [1460, 520]
policy When payment captured, ship it [1660, 300]
command Ship Order [1880, 300]
aggregate Order [2080, 290] (id agg_order_ship)
event Order Shipped [2280, 300]
Customer -> Place Order
Place Order -> #agg_order
#agg_order -> Order Placed
Order Placed -> Order Status
Order Placed -> When order placed, capture payment
When order placed, capture payment -> Capture Payment
Capture Payment -> Payment
Payment -> Payment Provider
Payment -> Payment Captured
Payment Captured -> When payment captured, ship it
When payment captured, ship it -> Ship Order
Ship Order -> #agg_order_ship
#agg_order_ship -> Order Shipped
```

`Payment` occurs once, so it needs no id and is referenced by label. All three example boards on
this page are canonical text: zero diagnostics, byte-identical round-trip, no arrow pointing left.

## Checking a board against its level

1. Collect the keywords actually used and compare them with the level's set. An off-level keyword
   means either the board or the `level` line is wrong — ask which.
2. `big-picture`: is every backbone sticky an `event` in past tense? Are there arrows that are doing
   work the x ordering should be doing?
3. `process`: does every command have an issuer, every event a source, every event→command hop a
   policy in between?
4. `design`: is there an aggregate between every command and event? Is any aggregate label used at
   several timeline positions _without_ repeated stickies?
5. All levels: does every backbone arrow point right? See `layout.md`.
