# Contributing

Thanks for helping improve the Event Storming Modeler. This is an npm-workspaces monorepo
(Node ≥ 22.13, npm, TypeScript ESM). Agent-oriented notes live in [`CLAUDE.md`](CLAUDE.md).

## Setup & inner loop

```bash
npm install
npm run build   # builds packages/* (workspace deps resolve to dist — build before testing)
npm test        # vitest run
npm run lint    # eslint . + type-check (same check the pre-commit hook runs)
```

Useful extras: `npm run dev:webapp`, `npm run dev:vscode`, `npm run depcruise` (module-graph check),
`npm run format` (Prettier).

### Named local URL via Portless

`npm run dev:webapp` (and the top-level `npm run dev`) serves the webapp through
[Portless](https://portless.sh) at a stable, named `.localhost` URL instead of a Vite port
(needs **Node ≥ 24**). Portless is a pinned **devDependency**, so `npm install` is all you need — no
global install. Config lives in [`apps/webapp/portless.json`](apps/webapp/portless.json)
(`{ "name": "event-storming", "script": "dev:app" }`): `npm run dev:webapp` runs bare `portless`,
which starts the real Vite server (the `dev:app` script) behind the proxy.

The URL is **per worktree** and Portless-derived — never hand-built: in a linked git worktree it
prepends the branch as a subdomain, so you get `https://<branch>.event-storming.localhost` in a
Conductor workspace and `https://event-storming.localhost` in the main checkout. Each worktree gets
its own URL, so parallel apps never collide. On start Portless **opens your browser** there and
prints it as a `➜ Portless:` line under Vite's output.

Portless needs an HTTPS proxy daemon on port 443, installed once per machine (it binds 443 and
trusts a local CA, so it needs **sudo** — which is also why Conductor's non-TTY Run button can't do
it for you):

```bash
npx portless trust            # add the local CA to your system trust store
npx portless service install  # run the HTTPS proxy as a background service (survives reboots)
```

Prefer a plain Vite server with no proxy? `npm run dev:webapp:plain` (or
`npm run dev:app -w apps/webapp`) runs Vite directly on `:5180` and needs none of the above.

## Browser & e2e tests

`npm run test:browser` (Vitest browser mode, incl. the `@miragon/modeler-api` conformance kit for
the collaborative modeler and viewer) and `npm run test:e2e` (Playwright, in `e2e/`) need a
Chromium browser. Locally, run `npx playwright install chromium` once.

`npm run test:e2e` runs two Playwright projects, each with its own Vite dev server built from the
package sources (no build needed):

| Project          | Serves                                                               | Port (env)                |
| ---------------- | -------------------------------------------------------------------- | ------------------------- |
| `webapp`         | the web app (`e2e/tests/*.spec.ts`)                                  | 5180 (`E2E_PORT`)         |
| `vscode-webview` | the VS Code webview inside the shell's VS Code stub (`e2e/webview/`) | 5190 (`E2E_WEBVIEW_PORT`) |

The `vscode-webview` project runs `@miragon/modeler-shell`'s conformance kit (geometry, ARIA, keys,
keyboard creation, the read-only lock of an invalid file, appearance, cleanup; the harness declares
the legend and the inspector `absent`, since Event Storming has neither, and any skip fails the
suite) and the webview's own protocol and chrome specs. Run one project with
`npm run test:e2e -- --project=vscode-webview`. Locally an already running server on a port is
reused, so pick free ports (`E2E_PORT=5387 E2E_WEBVIEW_PORT=5397 npm run test:e2e`) when another
app occupies 5180 or 5190.

In CI these two jobs run inside the official Playwright container (`mcr.microsoft.com/playwright`);
its image tag is derived from the root `package.json` `playwright` devDependency (see the
`playwright-version` job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) — so **when you
bump `@playwright/test` in `e2e/package.json`, bump the root `playwright` devDependency to the
identical version** (the version pin-check does not enforce that the two stay in sync).

## Design tokens

`packages/renderer/src/theme/cd-tokens.generated.css`, `cd-tokens.generated.json` and
`cd-canvas.css` are vendored unchanged from the `miragon-brand:modeler-tool-design` skill
(`assets/`). To update them, copy all three again, put the vendoring header back as the first line
of the two CSS files (the JSON gets none), and run `npm test` (`theme.sync` in the renderer,
`tokens.sync` in apps/vscode against the shell's sizes) and
`npm run test:e2e -- --project=vscode-webview` (the shell conformance kit). Never edit or reformat
them by hand.

## Pre-commit reality

The Husky hook (`.husky/pre-commit`) runs **only** `lint-staged` + `npm run lint` — i.e. ESLint and
type-check. It does **not** run tests, the build, or dependency-cruiser. So before you push, run
`npm test` (and `npm run depcruise` if you touched imports) yourself. `git commit --no-verify` bypasses
the hook — avoid it.

## Commit convention

[Conventional Commits](https://www.conventionalcommits.org/) — primarily `feat`, `fix`, `refactor`,
`chore`, `docs`.

```
feat(renderer): add hotspot sticky
fix(dsl): keep comment lines on round-trip
docs: add contributing guide
```

## Monorepo map & the DOM boundary (P1)

| Package                                | Purpose                                                   | DOM      |
| -------------------------------------- | --------------------------------------------------------- | -------- |
| `@miragon/event-storming-schema-model` | Board metamodel, Zod validation, JSON serialization       | DOM-free |
| `@miragon/event-storming-dsl`          | `.storm` text DSL ↔ model (lossless round-trip)           | DOM-free |
| `@miragon/event-storming-transforms`   | Pure `EventStormingBoard → EventStormingBoard` transforms | DOM-free |
| `@miragon/event-storming-renderer`     | diagram-js bootstrap, renderer, viewer, import/export     | DOM      |
| `apps/webapp`                          | Vite demo editor                                          | DOM      |
| `apps/vscode`                          | VS Code custom editor for `.storm`                        | DOM      |

**P1 — the DOM boundary:** the DOM-free packages (`schema-model`, `dsl`, `transforms`) must **never**
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`). This
is enforced twice — by ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** by
dependency-cruiser — so a violating import fails `npm run lint` and `npm run depcruise`.

Also keep the `.storm` DSL round-trip lossless and JSON serialization deterministic.

## Pull requests

- Keep PRs small and focused.
- Make sure local gates are green: `npm run lint`, `npm test`, `npm run depcruise`, `npm run build`.
- Working on board/domain semantics? Install the repo's own Claude plugin once —
  `/plugin marketplace add Miragon/event-storming-modeler` then
  `/plugin install event-storming-modeler@event-storming` — for the `event-storming` (method) and
  `storm-dsl` (`.storm` format) skills. The sources live in
  [`plugins/event-storming-modeler/skills/`](plugins/event-storming-modeler/skills/); after editing
  them run `claude plugin validate plugins/event-storming-modeler --strict`.
