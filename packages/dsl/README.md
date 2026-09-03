# @miragon/event-storming-dsl

[![npm](https://img.shields.io/npm/v/@miragon/event-storming-dsl)](https://www.npmjs.com/package/@miragon/event-storming-dsl)
[![License: MIT](https://img.shields.io/github/license/Miragon/event-storming-modeler)](https://github.com/Miragon/event-storming-modeler/blob/main/LICENSE)

DOM-free bridge between the Event Storming `.storm` text DSL and the `EventStormingBoard`
model — a lossless round-trip.

## Install

```bash
npm install @miragon/event-storming-dsl
```

## Usage

```ts
import { parseDSL, serializeDSL } from '@miragon/event-storming-dsl';

const board = parseDSL(`title Order Checkout
actor Customer [80, 300]
command Place Order [240, 300]
event Order Placed [620, 300]
Customer -> Place Order`);

const text = serializeDSL(board); // back to .storm text, losslessly
```

## The `.storm` format

One statement per line. Coordinates are `[x, y]` in board pixels (x first), optional
(default `[0, 0]`), unbounded — the canvas is free.

```
title Order Checkout            // config; also: style classic|dark
event Order Placed [620, 300]
command Place Order [240, 300] (color #ff0000)     // optional color override
actor Customer [80, 300]
aggregate Order [420, 290]
policy When order placed, ship it [800, 300]
readmodel Order Status [620, 120]
external Payment Provider [420, 520]
hotspot Double payment on retry? [620, 520]
note Design-level session [80, 80]
line [[100,100],[200,150],[180,240]] (dashed)      // freeform drawing

// arrows: name-referenced, optional label after ;
Customer -> Place Order
Order Placed -> When order placed, ship it; async
```

Unknown lines and comments are kept losslessly in `rawPassthrough`;
`parseDSLWithDiagnostics` reports uninterpretable lines with 1-based line numbers instead of
throwing.

Part of the [Event Storming Modeler](https://github.com/Miragon/event-storming-modeler) monorepo.

## License

MIT
