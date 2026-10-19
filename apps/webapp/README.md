# Event Storming Modeler — Web App

[![License: MIT](https://img.shields.io/github/license/Miragon/event-storming-modeler)](https://github.com/Miragon/event-storming-modeler/blob/main/LICENSE)

A browser editor for [Event Storming](https://www.eventstorming.com/) boards in the shared Miragon
modeler chrome ([`@miragon/modeler-shell`](https://www.npmjs.com/package/@miragon/modeler-shell)),
the same as in the VS Code extension: URL sharing ("Share"), opening and dropping `.storm`, `.json`
and `.txt` files, and the VS Code extension's exports (PNG, SVG, the transparent 4× PNG, JSON) plus
`.storm`. Replacing a board offers it back ("Board replaced · Undo", or `Ctrl/Cmd+Z`), the tab names
the board, and import findings are listed under the problems pill in plain words. The demo app for
the `@miragon/event-storming-*` packages.

**[Live demo](https://event-storming.modeler.miragon.io)**

![The web app](../../docs/screenshots/editor.png)

## Run locally

From the monorepo root:

```bash
npm install
npm run dev:webapp         # named HTTPS URL via Portless — one-time setup in CONTRIBUTING.md
npm run dev:webapp:plain   # plain Vite, http://localhost:5180
```

## Build

`npm run build:webapp` builds what Netlify ships; `npm run check:build -w apps/webapp` then checks
that `dist/index.html` carries the mode markup (theme-color, contrast line, `cd-shell-document`) and
the bundle keeps the shell's Lucide licence comment. CI runs both.

## License

MIT
