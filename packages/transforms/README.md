# @miragon/event-storming-transforms

[![npm](https://img.shields.io/npm/v/@miragon/event-storming-transforms)](https://www.npmjs.com/package/@miragon/event-storming-transforms)
[![License: MIT](https://img.shields.io/github/license/Miragon/event-storming-modeler)](https://github.com/Miragon/event-storming-modeler/blob/main/LICENSE)

DOM-free, pure `EventStormingBoard → EventStormingBoard` transforms — move, kind, color, arrange.
No undo stack: every transform returns a new board and leaves the input untouched.

## Install

```bash
npm install @miragon/event-storming-transforms
```

## Usage

```ts
import { parseDSL } from '@miragon/event-storming-dsl';
import { moveElement, setStickyKind } from '@miragon/event-storming-transforms';

const board = parseDSL('event Order Placed [620, 300]');
const [orderPlaced] = board.elements;

const moved = moveElement(board, orderPlaced.id, { x: 800, y: 300 }); // returns a new board
const retyped = setStickyKind(moved, orderPlaced.id, 'policy');
```

Also included: `moveBy` (delta translation), `setColor`/`clearColor` (sticky color override),
`alignToRows` (snap stickies into per-kind swimlanes) and `spreadTimeline` (spread stickies
evenly along the timeline).

Part of the [Event Storming Modeler](https://github.com/Miragon/event-storming-modeler) monorepo.

## License

MIT
