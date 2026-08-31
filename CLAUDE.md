# CLAUDE.md

TypeScript library for viewing and editing [Event Storming](https://www.eventstorming.com/) boards,
built on [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). Shared core for two targets:
a web app and a VS Code extension.

## Monorepo (npm workspaces)

Workspaces are declared in the root `package.json` (`workspaces` array, listed in topological
build order). **All** versions are pinned to exact values inline in each package's `package.json`
(`.npmrc` sets `save-exact=true`) — including internal `@miragon/event-storming-*` deps, which pin
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
- Pin **all** dependencies to exact versions — no version ranges (`^`/`~`/`>=`/`*`), internal
  workspace deps included (kept in sync by release-please's `node-workspace` plugin).
  CI-enforced via `miragon/pin-npm-dependencies`. See
  [`.claude/rules/package-json-fixed-versions.md`](.claude/rules/package-json-fixed-versions.md).
- For Event-Storming domain work, use the skill in
  [`.claude/skills/event-storming/`](.claude/skills/event-storming/).
- Contributor onboarding in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Design system (mandatory)

All UI/visual work in this repo MUST follow the Miragon product design system. This is not optional.
Source of truth: the `miragon-brand:modeler-tool-design` Claude skill in
[Miragon/corporate-identity](https://github.com/Miragon/corporate-identity). If the plugin is
installed, the skill auto-loads on UI work; otherwise read the guide directly:
https://raw.githubusercontent.com/Miragon/corporate-identity/main/plugins/miragon-brand/skills/modeler-tool-design/assets/modeler-design-system.md

Install once: `/plugin marketplace add Miragon/corporate-identity` then
`/plugin install miragon-brand@miragon`.

Brand tokens are vendored from that skill (`cd-tokens.generated.css`) — do not fork hex values;
re-copy from the skill to update. Reference implementation in this repo: tokens
[`packages/renderer/src/theme/palette.ts`](packages/renderer/src/theme/palette.ts) · drift test
[`packages/renderer/test/theme.sync.test.ts`](packages/renderer/test/theme.sync.test.ts) · canvas
colours [`packages/renderer/src/draw/styles.ts`](packages/renderer/src/draw/styles.ts) · in-canvas
chrome [`packages/renderer/src/assets/event-storming.css`](packages/renderer/src/assets/event-storming.css)
· app chrome + toast `apps/webapp/src/{style.css,toast.ts,main.ts}` · VS Code webview
[`apps/vscode/src/webview/style.css`](apps/vscode/src/webview/style.css).

## Code Style

- Write comments only when explicitly requested. Otherwise write self-explanatory code — descriptive
  function and parameter names, no abbreviations.
- If comments are needed: make them **WHY**-driven, not **HOW**.
