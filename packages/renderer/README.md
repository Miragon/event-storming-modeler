# @miragon/event-storming-renderer

[![npm](https://img.shields.io/npm/v/@miragon/event-storming-renderer)](https://www.npmjs.com/package/@miragon/event-storming-renderer)
[![License: MIT](https://img.shields.io/github/license/Miragon/event-storming-modeler)](https://github.com/Miragon/event-storming-modeler/blob/main/LICENSE)

[diagram-js](https://github.com/bpmn-io/diagram-js)-based renderer for
[Event Storming](https://www.eventstorming.com/) boards: `Viewer`, `NavigatedViewer`, and a full
editable `Modeler`, plus `.storm` DSL / JSON / SVG import and export. Browser/DOM only.

## Install

```bash
npm install @miragon/event-storming-renderer
```

## Usage

```ts
import { NavigatedViewer } from '@miragon/event-storming-renderer';
import '@miragon/event-storming-renderer/assets/event-storming.css';

const viewer = new NavigatedViewer({ container: document.querySelector('#canvas')! });

await viewer.importDSL(`title Order Checkout
actor Customer [80, 300]
command Place Order [240, 300]
event Order Placed [620, 300]
Customer -> Place Order
Place Order -> Order Placed`);

const board = viewer.exportMap(); // canonical JSON model
const dsl = viewer.exportDSL(); // back to .storm text
const { svg } = await viewer.saveSVG();
```

Swap `NavigatedViewer` for `Modeler` to get the editable board (sticky palette, context pad,
arrows, undo/redo). Stickies are colored per kind (`STICKY_STYLES`): domain event, command,
actor, aggregate, policy, read model, external system, hotspot — plus free-text notes and
freeform drawings on an unbounded canvas.

### Options

`Viewer`, `NavigatedViewer` and `Modeler` take the same options:

| Option              | Default            | Purpose                                                      |
| ------------------- | ------------------ | ------------------------------------------------------------ |
| `container`         | a detached `<div>` | Host element; without one, mount later with `attachTo(host)` |
| `width`, `height`   | `100%`, `600px`    | Container size (`100%` high when a `container` is given)     |
| `additionalModules` | `[]`               | diagram-js modules appended after the renderer's own         |
| `undoRedoKeys`      | `true`             | `Modeler` only: bind Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z and Ctrl+Y |

Pass `undoRedoKeys: false` when the host owns the history, as the VS Code extension does: the keys
then reach the host untouched and the host undoes the document, while copy, paste, delete, the
arrow keys and the single-key tools keep working on the canvas.

The modeler's keyboard listens on `document`, but only acts on keys aimed at the canvas: the
target lies inside the canvas container, or nothing is focused (`document.body`). Keys another
listener already handled (`defaultPrevented`) and keys typed into text fields are left alone, and
the canvas container gets no `tabindex` of its own.

### Fonts

The package ships no fonts and uses no CDN. The canvas typeface is **Geist** (Miragon corporate
identity); provide it yourself — recommended self-hosted via [`@fontsource`](https://fontsource.org/)
(one variable file covers all weights):

```ts
import '@fontsource-variable/geist/wght.css';
```

Part of the [Event Storming Modeler](https://github.com/Miragon/event-storming-modeler) monorepo.

## License

MIT

The palette's Lasso and Draw icons (`square-dashed-mouse-pointer`, `spline`) are copied from
[Lucide](https://lucide.dev) (`lucide-static` 1.59.0):

> ISC License
>
> Copyright (c) 2026 Lucide Icons and Contributors
>
> Permission to use, copy, modify, and/or distribute this software for any purpose with or without
> fee is hereby granted, provided that the above copyright notice and this permission notice
> appear in all copies.
>
> THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
> SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
> AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
> WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
> NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
> PERFORMANCE OF THIS SOFTWARE.
