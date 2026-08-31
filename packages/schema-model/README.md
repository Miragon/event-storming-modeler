# @miragon/event-storming-schema-model

[![npm](https://img.shields.io/npm/v/@miragon/event-storming-schema-model)](https://www.npmjs.com/package/@miragon/event-storming-schema-model)
[![License: MIT](https://img.shields.io/github/license/Miragon/event-storming-modeler)](https://github.com/Miragon/event-storming-modeler/blob/main/LICENSE)

DOM-free Event Storming metamodel: types, Zod validation, schema migrations, and deterministic
JSON serialization.

A board is a set of stickies (domain events, commands, actors, aggregates, policies, read models,
external systems, hotspots, notes, freeform drawings) plus arrows between them. Positions are
element centers in board pixels on an unbounded free canvas.

## Install

```bash
npm install @miragon/event-storming-schema-model
```

## Usage

```ts
import {
  createEmptyBoard,
  serializeBoard,
  parseBoardJSON,
} from '@miragon/event-storming-schema-model';

const board = createEmptyBoard('Order Checkout');

const json = serializeBoard(board); // deterministic: stable key order, rounded coordinates
const restored = parseBoardJSON(json); // validated + migrated to the current schema
```

Part of the [Event Storming Modeler](https://github.com/Miragon/event-storming-modeler) monorepo.

## License

MIT
