# Event Storming for VS Code

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/miragon-gmbh.event-storming-modeler?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=miragon-gmbh.event-storming-modeler)
[![License: MIT](https://img.shields.io/github/license/Miragon/event-storming-modeler)](https://github.com/Miragon/event-storming-modeler/blob/main/LICENSE)

[Event Storming](https://www.eventstorming.com) is a workshop format for exploring a business
domain with sticky notes: domain events on a timeline, the commands that trigger them, and the
people, policies and systems around them. This extension lets you create and edit Event Storming
boards directly inside VS Code: it opens `.storm` files (a simple plain-text DSL) in a graphical
editor, while the text file stays the source of truth, so save, Git, and diff keep working.

![The Event Storming editor](https://raw.githubusercontent.com/Miragon/event-storming-modeler/main/docs/screenshots/editor.png)

New to Event Storming? Start with [eventstorming.com](https://www.eventstorming.com) and Alberto
Brandolini's book [Introducing EventStorming](https://leanpub.com/introducing_eventstorming).

## Getting started

Install **Event Storming Modeler** (publisher `miragon-gmbh`) from the VS Code Marketplace, then
start from a filled-in order-checkout example or a blank board. The built-in **Get Started with
Event Storming** walkthrough is the recommended first stop: click its **Create board from example**
button and you have a ready-made board to explore. From there you can open any `.storm` file.

Prefer commands? Run these from the Command Palette (`Cmd/Ctrl+Shift+P`, type _"Event Storming"_):

- **Event Storming: New Board from Example** — pick a location, pre-filled with the order-checkout
  example.
- **Event Storming: New Empty Board** — same, but a blank board (also under **File > New File…**).

## Reading a board

Each sticky color has a meaning: **Domain Event** (orange), **Command** (blue), **Actor** (light
yellow), **Aggregate** (yellow), **Policy** (purple), **Read Model** (green), **External System**
(pink), **Hotspot** (red), plus free-text notes and freehand drawings. Time flows left to right —
earlier events sit to the left of later ones — and arrows connect the stickies into a story.

## Editing a board

- **Custom editor for `.storm`.** Open a board file and you get the full graphical editor, backed
  by the plain-text file. Editing the text in a split view re-renders the canvas live (two-way
  sync), and VS Code tracks dirty state as you go. To reopen a board as raw text, use
  **View: Reopen Editor With…**, then pick **Text Editor**.
- **Full modeler:** the tool palette on the side and the context pad on a selected sticky (append,
  connect, change type, delete), free movement on an unbounded canvas, inline label editing, and
  sticky color overrides. Undo/redo via `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`.
- **Collapsed menu** (top-right, Excalidraw-style): fit-to-view · export SVG/PNG (as a picture).
- **Self-hosted font** — no CDN, offline-capable.

> TODO: `icon.png` is a placeholder carried over from the previous project and needs Event
> Storming artwork.

## Development

Building from source and the dev loop are documented in
[CONTRIBUTING.md](https://github.com/Miragon/event-storming-modeler/blob/main/CONTRIBUTING.md).

## License

MIT
