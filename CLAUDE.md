# CLAUDE.md

TypeScript library for viewing and editing [Event Storming](https://www.eventstorming.com/) boards,
built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). Shared core for two targets:
a web app and a VS Code extension.

## Monorepo (npm workspaces)

Workspaces are declared in the root `package.json` (`workspaces` array, listed in topological
build order). Versions are pinned to exact values inline in each package's `package.json`
(`.npmrc` sets `save-exact=true`) — the one exception being consumer-shared runtime libs declared
as ranged `peerDependencies` (see Conventions) — including internal `@miragon/event-storming-*` deps, which pin
to the referenced package's **current version** (npm links them to the local workspace because the
local version satisfies the pin). Exact pinning is enforced in CI by
[`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies) (the `pin-check`
job).

| Package                                | Purpose                                                             | DOM |
| -------------------------------------- | ------------------------------------------------------------------- | --- |
| `@miragon/event-storming-schema-model` | Board metamodel, Zod validation, timeline sort, JSON serialization  | no  |
| `@miragon/event-storming-dsl`          | `.storm` text DSL ↔ model (lossless round-trip)                     | no  |
| `@miragon/event-storming-transforms`   | Pure `EventStormingBoard → EventStormingBoard` transforms (move, …) | no  |
| `@miragon/event-storming-renderer`     | diagram-js bootstrap, renderer, viewer, import/export, CSS          | yes |
| `apps/webapp`                          | Vite demo editor                                                    | yes |
| `apps/vscode`                          | VS Code extension: custom editor for `.storm`                       | yes |

**P1 — DOM boundary:** the DOM-free packages (`schema-model`, `dsl`, `transforms`) must **never**
import `diagram-js`/DOM libraries (`tiny-svg`, `min-dom`) or use the DOM (`window`/`document`).
Enforced twice — ESLint (`no-restricted-imports`/`no-restricted-globals`) **and** `dependency-cruiser`
— so a violating import fails `npm run lint` and `npm run depcruise`.

## Commands

- `npm run build` — all packages · `npm run build:webapp` · `npm run build:vscode`
- `npm run dev:webapp` (alias: `npm run dev`) serves the webapp via [Portless](https://portless.sh)
  at a per-worktree `https://<branch>.event-storming.localhost` URL (Portless-derived from the git
  worktree; config in [`apps/webapp/portless.json`](apps/webapp/portless.json); one-time `npx
portless service install` — see [`CONTRIBUTING.md`](CONTRIBUTING.md)). `npm run dev:webapp:plain`
  for plain Vite on `:5180`. · `npm run dev:vscode`
- `npm test` — Vitest · `npm run typecheck` · `npm run lint` (ESLint + typecheck)
- `npm run test:browser` — Vitest in Chromium (renderer integration, the `@miragon/modeler-api`
  conformance kit) · `npm run test:e2e` — Playwright, two projects: `webapp` and `vscode-webview`
  (the webview inside the shell's VS Code stub, incl. the shell conformance kit); one project with
  `npm run test:e2e -- --project=vscode-webview`, other ports via `E2E_PORT` /
  `E2E_WEBVIEW_PORT` (default 5180 / 5190)
- `npm run format` — Prettier · `npm run depcruise` — check the module graph

Requirements: Node ≥ 22.13, npm. Build packages before running tests (workspace deps resolve to
`dist`). The Husky pre-commit hook runs **only** lint-staged + `npm run lint` (ESLint + type-check) —
**not** tests/build/depcruise; run `npm test` yourself before pushing.

## Git

Everything is managed via **Conventional Commits** — primarily `feat`, `fix`, `refactor`, `chore`,
`docs`. Example: `feat(renderer): add hotspot sticky`.

## Releases

Releases are driven by [release-please](https://github.com/googleapis/release-please) on push to
`main` ([`.github/workflows/release-please.yml`](.github/workflows/release-please.yml)). The config
([`release-please-config.json`](release-please-config.json)) declares a **component per package**
(`schema-model`, `dsl`, `transforms`, `renderer`, `vscode`, `webapp`) with
`include-component-in-tag: true`, so each released package gets its own version, tag (e.g.
`renderer-v0.1.1`) and changelog; versions are tracked in
[`.release-please-manifest.json`](.release-please-manifest.json). The **`node-workspace` plugin**
automatically bumps every internal `@miragon/event-storming-*` dependency pin (including peer
dependencies) when a workspace dependency is released — no manual config entries per dependency
edge are needed. Merging the release PR tags the repo and publishes the released `packages/*`
libraries to npm (with provenance) and the VS Code extension
(`miragon-gmbh.event-storming-modeler`) to the VS Code Marketplace and Open VSX.

## Conventions

- Keep core packages (`schema-model`, `dsl`, `transforms`) strictly DOM-free (P1, above).
- The `.storm` DSL round-trip must stay lossless (unknown lines survive via `rawPassthrough`);
  board JSON serialization must be deterministic. Board transforms are pure functions.
- Pin **all** `dependencies`/`devDependencies` to exact versions — no version ranges
  (`^`/`~`/`>=`/`*`), internal workspace deps included (kept in sync by release-please's
  `node-workspace` plugin). CI-enforced via `miragon/pin-npm-dependencies`. **Exception:**
  consumer-shared third-party runtime libs (`zod`; `diagram-js`/`didi`/`tiny-svg`) are
  `peerDependencies` with **caret ranges** so consumers can dedupe against a single copy —
  mirrored by an exact `devDependency`, with the bundling apps declaring the exact version. See
  [`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).
- The repo's Claude skills ship as the **`event-storming-modeler` plugin**
  ([`plugins/event-storming-modeler/`](plugins/event-storming-modeler/)) via the marketplace in
  [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json): `event-storming` for
  domain work, `storm-dsl` for the `.storm` text format (grammar, coordinates, round-trip,
  diagnostics). Install once with `/plugin marketplace add Miragon/event-storming-modeler` and
  `/plugin install event-storming-modeler@event-storming`; the skill files are readable directly
  under `plugins/event-storming-modeler/skills/` either way.
- The renderer implements the collaborative-modeler contract
  [`@miragon/modeler-api`](https://www.npmjs.com/package/@miragon/modeler-api)
  (`createCollaborativeModeler` / `createCollaborativeViewer`, notation `event-storming`, in
  [`packages/renderer/src/collaborative/`](packages/renderer/src/collaborative/)); its conformance
  kit runs in `npm run test:browser`. The DOM-free packages may take only type-only imports from
  the contract (ESLint and dependency-cruiser). The elements surface lists stickies only: their ids
  survive a save and re-open because the serializer writes `(id …)` back whenever the parser would
  not derive the same id at that line; notes, drawings and arrows have no id grammar yet. New
  sticky ids come from a per-instance counter (`allocateId`), so stickies two peers add at the same
  time can collide (`event_1`); the conformance test accepts the kit's advisory for it (contract 1.1
  only recommends collision-free ids).
- Contributor onboarding in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Design system (mandatory)

All UI/visual work in this repo MUST follow the Miragon product design system. This is not optional.
Source of truth: the `miragon-brand:modeler-tool-design` Claude skill in
[Miragon/corporate-identity](https://github.com/Miragon/corporate-identity). If the plugin is
installed, the skill auto-loads on UI work; otherwise read the guide directly:
https://raw.githubusercontent.com/Miragon/corporate-identity/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md

Install once: `/plugin marketplace add Miragon/corporate-identity` then
`/plugin install miragon-brand@miragon`.

The design-system files are vendored **unchanged** from that skill (design system 1.12.0) into
[`packages/renderer/src/theme/`](packages/renderer/src/theme/): `cd-tokens.generated.css`,
`cd-tokens.generated.json` and `cd-canvas.css`. The two CSS files carry one extra first line, the
vendoring header; the JSON is byte-identical. Never edit or reformat them (Prettier-ignored, marked
`linguist-generated`) and never fork a hex value: re-copy all three from the skill's `assets/` to
update, re-add the header, and run `npm test`.
[`event-storming.css`](packages/renderer/src/assets/event-storming.css) starts with
`@import '../theme/cd-tokens.generated.css' layer(event-storming-tokens)`, then `diagram-js.css`,
then `cd-canvas.css` (unlayered, so its `--bio-*`/`.djs-parent` mapping beats diagram-js's
defaults); both apps get the tokens through the renderer CSS and import no token file themselves.
Drift tests: [`packages/renderer/test/theme.sync.test.ts`](packages/renderer/test/theme.sync.test.ts)
(import order and layer, the header, the JSON roles against the CSS so a partial re-copy fails,
every `MIRAGON` value in [`palette.ts`](packages/renderer/src/theme/palette.ts) against its `--cd-*`
token, no colour literal and no fixed palette token in `event-storming.css` (it reads the
`--cd-ui-*` roles only), no `style dark` rendering, overlays below the palette, palette rules scoped
away from the shell) and [`apps/vscode/test/tokens.sync.test.ts`](apps/vscode/test/tokens.sync.test.ts)
(the shell's `SHELL` sizes against the vendored `shell` group). The canvas drawing keeps literal
light colours in its SVG attributes (`draw/styles.ts`), never a `var()`. The DSL's `style dark`
stays in the board config for the round-trip, but nothing renders it (guide §10.7).

**VS Code chrome = `@miragon/modeler-shell`.** The webview
([`apps/vscode/src/webview/main.ts`](apps/vscode/src/webview/main.ts)) mounts the shared Miragon
modeler chrome (menu, palette skin, chrome tooltip, zoom panel and keys, fit, problems pill, status
box, empty-file hint, theme bridge, key interception); the extension host uses the shell's webview
HTML/CSP and theme bridge. Stylesheet order there: fonts, the renderer, `./style.css` (modeler-owned
content only, `--cd-ui-*` roles only, never `var(--vscode-*)`), `@miragon/modeler-shell/shell.css`
last. The renderer's own palette rules apply only to `.djs-palette:not([data-chrome='palette'])`,
so a shell-skinned palette wears the shell's look alone. **Renderers never import the shell** — only
the apps (and `e2e/`) do; `packages/*` reaching `@miragon/modeler-shell` fails ESLint and
dependency-cruiser. The webview runs on `createCollaborativeModeler` (the tested contract path),
passes the shell's fit insets as `freeRectInsets` (keyboard creation from the palette) and toggles
the renderer's `eventStormingReadOnly` lock together with `shell.setReadOnly`. The web app does not
use the shell yet. The VSIX ships `apps/vscode/THIRD_PARTY_NOTICES.md`, generated from the bundles
(`npm run notices -w apps/vscode`; a unit test fails when it is stale).

Reference implementation in this repo: tokens
[`packages/renderer/src/theme/palette.ts`](packages/renderer/src/theme/palette.ts) · canvas
colours [`packages/renderer/src/draw/styles.ts`](packages/renderer/src/draw/styles.ts) · in-canvas
chrome [`packages/renderer/src/assets/event-storming.css`](packages/renderer/src/assets/event-storming.css)
· app chrome + toast `apps/webapp/src/{style.css,toast.ts,main.ts}` · VS Code webview
[`apps/vscode/src/webview/`](apps/vscode/src/webview/).

## Code Style

- Write comments only when explicitly requested. Otherwise write self-explanatory code — descriptive
  function and parameter names, no abbreviations.
- If comments are needed: make them **WHY**-driven, not **HOW**.
