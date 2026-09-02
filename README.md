# Event Storming Modeler

[![License: MIT](https://img.shields.io/github/license/Miragon/event-storming-modeler)](LICENSE)
[![CI](https://github.com/Miragon/event-storming-modeler/actions/workflows/ci.yml/badge.svg)](https://github.com/Miragon/event-storming-modeler/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@miragon/event-storming-renderer)](https://www.npmjs.com/package/@miragon/event-storming-renderer)
[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/miragon-gmbh.event-storming-modeler.svg?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.event-storming-modeler)

Create, edit and embed digital [Event Storming](https://www.eventstorming.com/) boards — a
TypeScript library, a VS Code extension, and a web app, all built on
[diagram-js](https://github.com/bpmn-io/diagram-js).

**[Try the web app →](https://event-storming-modeler.netlify.app)**

![The Event Storming editor](docs/screenshots/editor.png)

_Screenshots still show the previous editor and will be regenerated for the Event Storming UI._

## Install

```bash
npm install @miragon/event-storming-renderer
```

```ts
import { NavigatedViewer } from '@miragon/event-storming-renderer';
import '@miragon/event-storming-renderer/assets/event-storming.css';

const viewer = new NavigatedViewer({ container: document.querySelector('#canvas')! });

await viewer.importDSL(`title Order Checkout
actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [420, 290]
event Order Placed [620, 300]
Customer -> Place Order
Place Order -> Order
Order -> Order Placed`);

const board = viewer.exportMap(); // canonical JSON model
const dsl = viewer.exportDSL(); // back to .storm text
const { svg } = await viewer.saveSVG();
```

## What you get

- **Embeddable viewer & modeler** on diagram-js — palette, context pad, move/connect, inline
  labels, undo/redo, free canvas (no grid, no axes — just stickies on a timeline).
- **Lossless `.storm` DSL round-trip** and a deterministic JSON model.
- **VS Code extension** — a custom editor for `.storm` files.
- **Web app** — an Excalidraw-style editor with URL sharing and PNG/SVG picture export.
- **Strict DOM-free core** (model, DSL, transforms) — usable in any JavaScript runtime.
- **Self-hosted fonts** — no CDN, offline-capable.

### Sticky notes

| Sticky          | DSL keyword | Default size | Fill      |
| --------------- | ----------- | ------------ | --------- |
| Domain Event    | `event`     | 130×90       | `#FFB84D` |
| Command         | `command`   | 130×90       | `#7EC8F0` |
| Actor           | `actor`     | 100×65       | `#FFF9B1` |
| Aggregate       | `aggregate` | 180×110      | `#FFE066` |
| Policy          | `policy`    | 180×110      | `#C9A0DC` |
| Read Model      | `readmodel` | 130×90       | `#A8D08D` |
| External System | `external`  | 180×110      | `#F4A6C0` |
| Hotspot         | `hotspot`   | 130×90       | `#E85D75` |
| Note            | `note`      | auto         | `#ECECEC` |

Plus freeform **drawings** (`line`) and labelled **arrows** (`->`) between stickies. Every sticky
accepts an optional `(color #hex)` override.

### Editor interactions

| Action                     | How                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multi-select (lasso)       | Palette tool, `L`, or `Shift` + drag on the empty canvas                                                                                                                                         |
| Draw lines/shapes          | Palette tool — click point by point; click the last point again (or double-click/`Enter`/`Esc`) to finish, click the start point to close; drag the handles of a selected drawing to move points |
| Quick create at the cursor | `E` domain event, `C` command                                                                                                                                                                    |
| Add to selection           | `Shift` + click on elements                                                                                                                                                                      |
| Copy / paste               | `Ctrl/Cmd+C`, `Ctrl/Cmd+V` — paste attaches to the cursor; click places, `Esc` cancels                                                                                                           |
| Duplicate (in place)       | `Ctrl/Cmd+D`                                                                                                                                                                                     |
| Nudge selection            | Arrow keys (`Shift` = coarse)                                                                                                                                                                    |
| Undo / redo                | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z`                                                                                                                                                                |
| Zoom                       | `Ctrl/Cmd` + `+` / `-` / `0` (fit), controls bottom-right                                                                                                                                        |
| Edit label                 | Double-click a sticky (`Cmd/Ctrl+Enter` saves)                                                                                                                                                   |
| Format a note              | Bold/italic/bullets via the floating toolbar or `Cmd/Ctrl+B` / `Cmd/Ctrl+I`, text alignment via the toolbar's align buttons; stored as a tiny Markdown subset in the label                       |
| Change sticky type         | Context pad → change-type popup                                                                                                                                                                  |
| Type captions on/off       | Menu → "Type captions" (small kind caption at the bottom of every sticky; per-client view preference)                                                                                            |
| Recolor                    | Context pad → color picker                                                                                                                                                                       |

## The `.storm` DSL

A line-based text format: `<kind> <Name> [x, y]` places a sticky (pixel coordinates, center),
`A -> B` connects two stickies by name (optional label after `;`). Unknown lines survive
round-trips untouched. An optional `level big-picture|process|design` statement records the
workshop level and filters which sticky kinds the editor offers for creation (absent = `design`,
everything available); existing elements of any kind stay valid on every level. An actor,
hotspot or note can be pinned onto a host sticky with the trailing `(on <Host Name>)` suffix —
it then moves together with its host:

```
command Approve Order [240, 300]
actor Manager [250, 280] (on Approve Order)
note Check with legal first [250, 340] (on Approve Order)
```

Notes auto-size to their text; a hand-resized note records its box with the trailing
`(size <w>x<h>)` suffix:

```
note Kickoff agenda [80, 80] (size 240x160)
```

Two stickies may carry the same label (e.g. the same aggregate appearing twice on the
timeline). An ambiguous name is disambiguated with the sticky's internal id: an `(id …)`
suffix on the declaration and `#id` in references (arrow endpoints and `(on …)` hosts) —
unambiguous boards keep referencing purely by name, without any ids in the text:

```
aggregate Order [420, 290] (id agg_order)
aggregate Order [1160, 290] (id agg_order_2)

Place Order -> #agg_order
#agg_order -> Order Placed
Ship Order -> #agg_order_2
#agg_order_2 -> Order Shipped
```

The full example board
([`example/order-checkout.storm`](example/order-checkout.storm)):

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

## Packages

| Package                                                         | Description                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`@miragon/event-storming-schema-model`](packages/schema-model) | Board metamodel, Zod validation, deterministic JSON (DOM-free)       |
| [`@miragon/event-storming-dsl`](packages/dsl)                   | `.storm` text DSL ↔ model, lossless round-trip (DOM-free)            |
| [`@miragon/event-storming-transforms`](packages/transforms)     | Pure `EventStormingBoard → EventStormingBoard` transforms (DOM-free) |
| [`@miragon/event-storming-renderer`](packages/renderer)         | diagram-js renderer, viewer, import/export                           |
| [`apps/webapp`](apps/webapp)                                    | Web editor (demo, deployed on Netlify)                               |
| [`apps/vscode`](apps/vscode)                                    | VS Code extension for `.storm`                                       |

## Quickstart (development)

```bash
npm install
npm run build        # build all packages
npm test             # unit tests
npm run dev:webapp   # run the web editor locally
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full inner loop, browser/e2e tests and the
Portless dev URL setup.

## Fonts

The renderer ships no fonts and loads nothing from a CDN. The typeface is **Geist** (Miragon
corporate identity); provide it yourself — recommended self-hosted via
[`@fontsource`](https://fontsource.org/) (one variable file covers all weights):

```ts
import '@fontsource-variable/geist/wght.css';
```

Without a font the fallback chain degrades cleanly to system sans.

## Acknowledgements

Based on [wardley-maps-modeler](https://github.com/Miragon/wardley-maps-modeler).

## License

[MIT](LICENSE)
