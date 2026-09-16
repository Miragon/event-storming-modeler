# `.storm` — layout and geometry

Coordinates are the part of a generated board that most often comes out wrong: boxes overlap, the
timeline is unreadable, or pinned stickies land nowhere near their host. This file has the numbers.

## Coordinate system

- `[x, y]`, **x first**, board pixels, addressing the element's **centre**.
- x grows right, y grows **down** (screen coordinates — a sticky at `y = 520` is _below_ one at
  `y = 300`).
- Unbounded: negative and very large values are legal, there is no grid and no clamping.
- Optional; missing means `[0, 0]`.
- On the board, left → right is the **timeline**: earlier → later. That is the one semantic the
  x axis carries.

## Box sizes

Every sticky kind has a fixed box. A note starts at the aggregate format and grows with its text
unless `(size …)` pins it.

| Kind                                       | Width | Height |
| ------------------------------------------ | ----- | ------ |
| `event`, `command`, `readmodel`, `hotspot` | 130   | 90     |
| `actor`                                    | 100   | 65     |
| `aggregate`, `policy`, `external`          | 180   | 110    |
| `note` (minimum, auto-grows)               | 180   | 110    |

Because coordinates are centres, two neighbours at the same `y` have a gap of
`Δx − (w₁ + w₂) / 2`.

| Neighbours | Pitch 180 | Pitch 200 | Pitch 220 |
| ---------- | --------- | --------- | --------- |
| 130 ↔ 130  | 50 px gap | 70 px     | 90 px     |
| 130 ↔ 180  | 25 px     | 45 px     | 65 px     |
| 180 ↔ 180  | 0 px      | 20 px     | 40 px     |

Aim for **≥ 40 px of air**. Practical rule: 180 px pitch for chains of small stickies, 200–220 px
wherever a 180-wide kind (aggregate, policy, external) sits.

## The default grid

```
y =  120   read models                 — what an actor looks at to decide
y =  300   the main timeline           — actor → command → aggregate → event → policy → …
y =  520   external systems, hotspots  — the boundary and the open questions
x   80, 240, 420, 620, 800, 980, 1160, 1340, …
```

The row bands are ~180 px above and ~220 px below the timeline, which clears even the 110-high
boxes comfortably. Keep read models and hotspots in the **same x column** as the event they belong
to, so the vertical relationship is visible without following the arrow.

Band placement and pinning are alternatives, never both: a hotspot in the `y = 520` band is a free
element that happens to sit under its event, while an `(on …)`-pinned one overlaps its host (see
**Pinning offsets**). Pin only when the hotspot belongs to exactly one sticky; otherwise leave it in
the band.

## Repeat, never reuse — one sticky is one point in time

A sticky is a **position on the timeline**, not a database row for a concept. If the `Order`
aggregate accepts a command at x = 440 and another one at x = 1180, that is **two aggregate
stickies with the same label** — not one sticky with four arrows converging on it.

The same applies to every kind that recurs: an actor who acts three times in the flow gets three
actor stickies, an external system called at two points gets two, a read model consulted in two
places gets two. Only ids must be unique, and repeated labels are fully legal.

This is the most common defect in generated boards: everything about `Order` gets collapsed onto one
sticky, arrows shoot backwards across the whole canvas, and the left-to-right reading — the one
thing an Event Storming board is for — is destroyed.

### The DSL trap that makes it worse

A plain-label reference resolves to the **first** declaration with that label, silently and without
a diagnostic. So this looks right and is wrong:

```
command Place Order [240, 300]
aggregate Order [440, 290]
event Order Placed [640, 300]
command Ship Order [980, 300]
aggregate Order [1180, 290]
event Order Shipped [1380, 300]
Place Order -> Order
Order -> Order Placed
Ship Order -> Order
Order -> Order Shipped
```

All four arrows bind to the aggregate at **x = 440**. The second one at x = 1180 ends up orphaned,
and two arrows run 500+ px backwards. The parser reports nothing.

Give every repeated sticky an explicit `(id …)` and reference it with `#id`:

```
command Place Order [240, 300]
aggregate Order [440, 290] (id agg_order)
event Order Placed [640, 300]
command Ship Order [980, 300]
aggregate Order [1180, 290] (id agg_order_ship)
event Order Shipped [1380, 300]
Place Order -> #agg_order
#agg_order -> Order Placed
Ship Order -> #agg_order_ship
#agg_order_ship -> Order Shipped
```

Name the ids after the occurrence (`agg_order_ship`), not by number — `agg_order_2` is what the
serializer auto-generates when you leave it out, and it tells a later reader nothing.

### The check: no arrow points left

For every backbone arrow, `from.x < to.x`. Off-backbone arrows — event → read model, command →
external system, external system → event — run near-vertically within one x column. Anything else
means a sticky was reused where it should have been repeated.

```
from.x > to.x                       → reused sticky, split it
from.x == to.x, large |Δy|          → fine: read model above, external/hotspot below
|from.x - to.x| > 3 columns         → suspicious: a step is missing, or a sticky was reused
```

## Swimlanes

When several actors or systems act in parallel, give each its own horizontal band:

- ~220 px between lane centres (110-high boxes plus air).
- Keep the **same x columns** across lanes, so causally aligned stickies line up vertically.
- Mark the lane with a left-aligned `note` at the lane's y, x well to the left of the first column
  (e.g. `x = −60`), or draw the separator with a `line`.

```
note **Customer** [-60, 300] (align left middle)
note **Warehouse** [-60, 520] (align left middle)
line [[40, 410], [1500, 410]] (dashed) (color #C4C4C4)
```

## Pinning offsets

A pinned element keeps its own absolute coordinates; `(on …)` only makes it _move with_ the host.
Place it deliberately overlapping — a pinned element never sits in one of the grid bands:

| Pin                   | Offset from host centre | Look                                    |
| --------------------- | ----------------------- | --------------------------------------- |
| `actor` on a command  | `(+10, −25)`            | small yellow sticky in the upper corner |
| `hotspot` on any host | `(+55, −40)`            | red flag clipped to the corner          |
| `note` on any host    | `(0, +90)`              | caption below the sticky                |

## Commentary notes

A note that comments on a sticky sits 120–150 px away from it — far enough not to overlap, close
enough to read as belonging to it. Above or below is usually clearer than beside.

## Review-note colours

Feedback added to someone else's board uses dark hues so it can never be mistaken for a pastel
domain sticky (the convention shared with the `event-storming` skill):

| Colour    | Hex       | Meaning                                          |
| --------- | --------- | ------------------------------------------------ |
| 🟢 Green  | `#15803d` | Good — well modelled / a genuine strength        |
| 🟠 Amber  | `#b45309` | Watch — naming smell, unclear flow, needs a look |
| 🔴 Red    | `#b91c1c` | Problem — wrong sticky kind, missing link        |
| 🔵 Blue   | `#1d4ed8` | Info / neutral observation                       |
| 🟣 Purple | `#7e22ce` | Idea / opportunity / suggested exploration       |

```
note Clear pivotal event — good anchor [620, 180] (color #15803d)
note Who issues this command? Add an actor [240, 420] (color #b45309)
```

## Worked board

The canonical example (`example/order-checkout.storm`, shown here without the blank lines the repo
file uses for readability). As printed it is exactly canonical text: zero diagnostics, and
`serialize(parse(…))` returns it byte-identically.

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
note Design-level session: checkout flow [80, 80]
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

Reading it: the customer issues `Place Order`; the `Order` aggregate — after consulting the
`Payment Provider` — emits `Order Placed`; a policy reacts and issues `Ship Order`, producing
`Order Shipped`. `Order Status` is the read model above the timeline, the hotspot below it flags an
open retry question. The two `Order` aggregates share a label, so both carry `(id …)` and the arrows
reference them as `#agg_order` / `#agg_order_2`.

Note the pitch: `80 → 240 → 420 → 620 → 800 → 980 → 1160 → 1340`, i.e. 160–200 px, widening around
the 180-wide aggregates and the policy.

## A big-picture board

At `level big-picture` only events, actors, externals and hotspots are offered — the board is a bare
timeline plus the questions it raises:

```
title Onboarding — Big Picture
level big-picture
event Signup Submitted [200, 300]
event Email Verified [400, 300]
event Identity Checked [600, 300]
event Account Activated [800, 300]
event First Login Completed [1000, 300]
actor Applicant [200, 140]
external Identity Provider [600, 520]
hotspot How long may a check take? [600, 660]
note Pivotal: the account exists from here on [800, 140] (color #1d4ed8)
Applicant -> Signup Submitted
Identity Provider -> Identity Checked
```

The hotspot sits directly under the external system it questions, in the same x column.
