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
| `freeRectInsets`    | none               | `Modeler` only: `() => ({ top, right, bottom, left })` in px |

Pass `undoRedoKeys: false` when the host owns the history, as the VS Code extension does: the keys
then reach the host untouched and the host undoes the document, while copy, paste, delete, the
arrow keys and the single-key tools keep working on the canvas.

The modeler's keyboard listens on `document`, but only acts on keys aimed at the canvas: the
target lies inside the canvas container, or nothing is focused (`document.body`). Keys another
listener already handled (`defaultPrevented`) and keys typed into text fields are left alone, and
the canvas container gets no `tabindex` of its own. Cmd/Ctrl+A selects the whole board. An import
erases the undo history without firing `commandStack.changed`, and fires `import.parse.start`,
`import.render.start` and `import.done` in that order. It frames the content centred at the
largest zoom that shows all of it, never above 100%; an empty board shows at 100%. A label being
typed when an import arrives is reopened on the same element afterwards, with the typed text.

Enter or Space on a creating palette entry (a click without a pointer, `detail` 0) places the
element in the centre of the container minus `freeRectInsets` (the margins a host's chrome covers),
24px down and right while that spot is taken, selects it and opens its label editor.

`eventStormingReadOnly` locks every edit while a host cannot save from the canvas (an invalid file
in an IDE): `diagram.get('eventStormingReadOnly').setReadOnly(true)` vetoes moves, resizes,
creates, connections and deletes through the diagram-js rules, and the keyboard, context pad, label
editor and drawing handles stop editing. Selection, zoom, pan, copy and export stay.

The DSL's `style dark` directive stays in the board config, so the text round-trips, but the
renderer paints nothing for it: the page's design-system mode decides light or dark, never the
file. The chrome reads the `--cd-ui-*` roles of the vendored Miragon tokens only, and the canvas
drawing keeps literal light colours in its SVG attributes, so exports look the same everywhere.

### Collaborative hosts

The package implements the collaborative-modeler contract of
[`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api) (notation
`event-storming`) and runs its conformance kit in CI:

```ts
import {
  createCollaborativeModeler,
  createCollaborativeViewer,
} from '@miragon/event-storming-renderer';

const modeler = createCollaborativeModeler(); // meta.editable: true
modeler.attachTo(host); // in the document, with a size
await modeler.importText(text); // silent, history erased, view fitted
const off = modeler.onContentChanged(() => save(modeler.exportText()));

const viewer = createCollaborativeViewer(); // meta.editable: false, never changes content
```

- `importText` resolves for every `.storm` text: the DSL keeps every line it cannot read in
  `rawPassthrough` (with a diagnostic, returned as a `warning`), gives a sticky that claims a
  reserved id (`event-storming-root`, `__implicitroot…`) a fresh one, and reads a coordinate or
  size beyond ±1e38 (more than the canvas's SVG transforms hold) as an unreadable line. A board
  passed to `diagram.importMap` that uses a reserved id rejects before the canvas changes.
- `onContentChanged` fires for every command-stack change, undo and redo included (also the
  workshop level), never for imports, view options (type captions) or the viewport.
- `getViewState()` / `setViewState()` read and set the diagram-js viewbox (`x`, `y`, `width`,
  `height`); an import fits the board, never above 100% and never below 0.1% (a board too wide to
  show whole at 0.1% is centred there instead).
- `elements` lists the stickies with their ids and labels, reveals (selects and scrolls to) one
  and reports the selection. Sticky ids survive a save and a re-open: the DSL writes `(id …)`
  back for every sticky whose id the parser would not derive again from its label at that line (one
  created on the canvas, a renamed one). Notes, drawings and arrows have no id in the text yet (theirs
  derive from their text or position), so they are not addressable.
- New sticky ids are not collision-free across peers: a sticky created on the canvas takes the
  lowest free `<prefix>_<n>` of its own instance, so two peers that each add one at the same time
  both write `(id event_1)`. When their texts merge, the parser gives the second sticky a fresh id,
  and whatever was linked to it points at the first. Contract 1.1 only recommends collision-free
  ids; the conformance test accepts this as its one advisory.
- `diagram` is the wrapped `Modeler` or `NavigatedViewer`, for everything outside the contract.
  `createCollaborativeModeler` accepts `additionalModules`, `undoRedoKeys` and `freeRectInsets`.
- After `destroy()`, `exportText()` returns the last state and `importText()` rejects.

#### Migrating a host

- **DOM.** `attachTo(host)` appends the diagram's own `.event-storming-container` inside `host`.
  Scope host CSS as a descendant (`.my-host .event-storming-container`), not as a compound selector
  on the host element.
- **What can go:** an echo latch around imports (they are silent), a command-stack shim for the
  viewer (it has none and needs none), special handling of the renderer's own viewbox change on
  import (the post-import view is the fit), and keeping the viewbox by hand (`getViewState` /
  `setViewState`).
- **What stays:** presence and view controls that need diagram-js services (canvas, element
  registry) go through `diagram`.
- **Empty text** imports as a blank board titled `Untitled Board`; a host that treats empty text
  differently keeps its own check.
- **Ids.** Hosts that derive ids from the text themselves (server-side extraction) read `(id …)`
  first and derive the rest exactly like the parser: `<prefix>_<slug(label)>`, `_2`, `_3`, … in line
  order.

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

The tool icons of the palette (`square-dashed-mouse-pointer`, and for Draw `spline` with a straight segment) and the icons of the
context pad and the note toolbar (`plus`, `arrow-right`, `replace`, `line-style`, `palette`,
`pencil`, `trash`, `bold`, `italic`, `list`, `text-align-*`, `align-vertical-justify-*`) are copied
from [Lucide](https://lucide.dev) (`lucide-static` 1.59.0):

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

`arrow-right`, `italic`, `plus` and `trash` are derived from [Feather](https://feathericons.com):

> The MIT License (MIT)
>
> Copyright (c) 2013-present Cole Bemis
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
> BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
