# Contributing

Thanks for helping improve the Event Storming Modeler. This is an npm-workspaces monorepo
(Node ≥ 22.22.2, npm, TypeScript ESM). Agent-oriented notes live in [`CLAUDE.md`](CLAUDE.md).

## External contributions

We're currently not accepting pull requests from outside the team. We don't have the resources to fully review and validate external contributions, so we can't guarantee that a merged change keeps the project free of bugs, free of security vulnerabilities or malicious code, and consistent with requirements that make sense for it. Pull requests opened by external contributors will be closed.

If you've found a bug or have an idea, please [open an issue](https://github.com/Miragon/event-storming-modeler/issues/new) instead. We read every one, and it's the best way to get something onto our radar.

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

Both projects run `@miragon/modeler-shell`'s conformance kit: `vscode-webview` on the `ide` host
(geometry, the legend's start state, ARIA, keys, the focus hand-back after a pointer click on
chrome, keyboard creation, a sticky's label editor that the shell's zoom, fit and refit leave open
and uncommitted, the read-only lock of an invalid file, appearance, cleanup), `webapp` on the `web`
host (the same plus the focus after a File action, primary action, legal line, start screen,
toasts, problems list and drop zone). The harnesses declare what Event Storming lacks `absent`
(the legend and the inspector; in the web app also the invalid-file state and a problem row that
selects an element, since its problems name lines, never elements; in the webview a menu action
that hands the focus to the canvas, since its Model group holds only the Level radios and the Type
captions checkbox), and any skip fails the suite. Both lead the kit's sizes with 1600 × 900, where
the example fits whole at 100 % (the reason is in
[`e2e/tests/support/shell-kit.ts`](e2e/tests/support/shell-kit.ts)). Next to the kit run the
webview's protocol and chrome specs and the web app's own (`webapp-chrome.spec.ts`: share link,
the fit to what the board draws, replace with undo, open, drop, exports, app keys, Delete after a
click on + or a palette entry). Run one project with
`npm run test:e2e -- --project=vscode-webview`. Locally an already running server on a port is
reused, so pick free ports (`E2E_PORT=5387 E2E_WEBVIEW_PORT=5397 npm run test:e2e`) when another
app occupies 5180 or 5190.

In CI these two jobs run inside the official Playwright container (`mcr.microsoft.com/playwright`);
its image tag is derived from the root `package.json` `playwright` devDependency (see the
`playwright-version` job in [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) — so **when you
bump `@playwright/test` in `e2e/package.json`, bump the root `playwright` devDependency to the
identical version** (the version pin-check does not enforce that the two stay in sync).

## VS Code smoke test

The e2e project `vscode-webview` runs the webview in a stand-in for VS Code. `npm run test:vscode`
starts the real one with the **packaged** extension, through the `@miragon/modeler-shell` driver
`runVsCodeSmoke` ([`apps/vscode/test-smoke/`](apps/vscode/test-smoke/), the Vitest project
`vscode`, so `npm test` stays fast):

1. packs the extension as the release does (`vsce package --no-dependencies`, which runs
   `vscode:prepublish`, the production build into `apps/vscode/dist`) and unpacks the VSIX into the
   OS temp directory, so VS Code loads exactly what ships and a module missing from the bundle is
   not found in a `node_modules` of the repository;
2. opens the fixture [`smoke.storm`](apps/vscode/test-smoke/smoke.storm) in the custom editor and
   checks the shell's menu, palette and zoom;
3. adds a sticky with Enter on the first creating palette entry, saves with the platform's save key
   (the file on disk changes and `parseDSLWithDiagnostics` accepts it with one sticky more), undoes
   (canvas and, saved again, the file are back to the fixture's exact text);
4. switches through VS Code's four default themes (Light Modern, Dark Modern, High Contrast, High
   Contrast Light); the webview has to stay light, with the high-contrast mark in the last two, and
   each theme gets a screenshot in `test-results/vscode-smoke/` (gitignored), e.g.
   `event-storming-dark.png`.

No build is needed to run it: the parser check takes the package sources, as the extension's
bundle does.

**Locally, in Docker (no window).** The way to run it on your machine: `npm run test:vscode:docker`
runs `npm run test:vscode` in a Linux container under `xvfb-run -a`, through the shell's command
`modeler-shell-vscode-docker`, so no VS Code window opens and nothing takes the focus. It needs
Docker (Docker Desktop on a Mac) next to the installed dependencies. Options go after `--`:

```bash
npm run test:vscode:docker                                 # newest stable VS Code
npm run test:vscode:docker -- --env VSCODE_VERSION=1.96.0  # the engines.vscode floor, or another
npm run test:vscode:docker -- --env VSCODE_SMOKE_KEEP=1    # VS Code's logs in vscode-logs/
```

The command copies the repository into the container without `node_modules` and `.git`, runs
`npm ci` there (the host's `node_modules` stay as they are) and brings `test-results/vscode-smoke/`
back, emptied first; paths in the log are the container's (`/work/…`). The first run builds the
image `modeler-shell-vscode-smoke:node<version>-<hash>` (about 0.9 GB, for the Node version that
runs the command) and downloads VS Code's Linux build into the Docker volume
`modeler-shell-vscode-cache`, both shared by every Miragon modeler on the machine; that takes about
a minute. Later runs take about 7 to 17 seconds, most of them under 10 (`npm ci` 2 to 7 s, the test
4 to 8 s). On Apple silicon the container runs VS Code's `linux-arm64` build, CI the `linux-x64`
one. `docker volume rm modeler-shell-vscode-cache modeler-shell-npm-cache` starts over; the details
are in the shell's README
([In Docker, without a window](https://github.com/Miragon/modeler-api/tree/main/packages/shell#in-docker-without-a-window)).

**Locally, with a window (macOS).** `npm run test:vscode` runs the same test on the host, for
watching VS Code go through it. `unzip` must be on the `PATH` (it is on macOS and Ubuntu).

```bash
npm run test:vscode                                 # newest stable VS Code
VSCODE_VERSION=1.96.0 npm run test:vscode           # the engines.vscode floor, or any other version
VSCODE_SMOKE_KEEP=1 npm run test:vscode             # keep VS Code's profile and logs ("kept <dir>")
VSCODE_SMOKE_VSIX=path/to.vsix npm run test:vscode  # smoke a packaged VSIX instead of packing one
```

A VS Code window opens for about 5 seconds and takes the focus; leave it alone until it closes. The
first run of a version downloads VS Code (about 330 MB, 0.9 GB unpacked) into
`~/Library/Caches/miragon-modeler-shell/vscode-test`, shared by every Miragon modeler on the
machine; later runs take about 6 to 7 seconds in all.

Either way the log names each step, then the VS Code version, the timings and every theme with its
screenshot; a failure names its step (`open: …`, `save: …`), and a failed open leaves
`event-storming-open-failure.png` with VS Code's error from the extension host. With
`VSCODE_SMOKE_KEEP=1` it also names the folder of VS Code's logs (main process, renderer, extension
host; from Docker they come back in `vscode-logs/`); an exception inside the webview is not in
them, it shows only in the webview's developer tools (**Developer: Open Webview Developer Tools**
while the extension runs in VS Code). Keep `playwright-core` in `apps/vscode/package.json` at the
root `playwright` version.

The test is not retried: every failure fails the run at once. The driver's save step
(`@miragon/modeler-shell` 0.4.1) reads the file only after the editor tab turned clean, which VS
Code does once its write has finished, and only when two reads 100 ms apart agree. The parse check
accepts only the fixture's board with one sticky more, since an empty or cut-short `.storm` file can
parse without a diagnostic; anything else fails the save step with the counts it found
(`save: the saved text does not parse: 6 elements and 0 arrows in 181 characters, expected 7 and 4 …`).
A theme switch VS Code does not pick up is the driver's to handle: it writes the setting again,
then switches through another default theme and back, all within its 30 s wait, and logs each of
these steps; a theme that still fails names the theme requested and the one VS Code shows
(`themes: Default High Contrast Light: the workbench never switched (no .hc-light): requested Default High Contrast Light, VS Code shows Default High Contrast …`).

**In CI.** [`.github/workflows/vscode-smoke.yml`](.github/workflows/vscode-smoke.yml) is a
reusable workflow: the CI workflow calls it as the job `vscode-smoke`, so `ci-ok` waits for it (see
[CI and the merge gate](#ci-and-the-merge-gate) for when it starts VS Code). Inside it, the matrix
job of the same name runs on `ubuntu-24.04` under `xvfb-run -a` (VS Code needs an X server), once
against the floor of `engines.vscode` (read from `apps/vscode/package.json` at run time) and once
against the newest stable release, passing each version as `VSCODE_VERSION`. The download is
cached per VS Code version. The screenshots are uploaded as the artifacts `vscode-smoke-minimum` and
`vscode-smoke-stable`, and, when a run failed, VS Code's logs (the job runs with
`VSCODE_SMOKE_KEEP=1`) as `vscode-smoke-logs-minimum` or `vscode-smoke-logs-stable`, each for 7
days. It calls `npm run test:vscode` on the runner, not the Docker command: the runner already has
an X server and VS Code's libraries, and `actions/cache` keeps each VS Code version between runs,
while the Docker command would build its image, install the dependencies a second time and download
VS Code again on every run, since a hosted runner keeps neither images nor volumes.

[`.github/workflows/vscode-smoke-weekly.yml`](.github/workflows/vscode-smoke-weekly.yml) calls the
same workflow every Monday, because a new VS Code arrives without a commit here, and on demand
(**Actions → VS Code smoke weekly → Run workflow**). When it fails, its `alert` job opens the
issue **VS Code smoke: the weekly run failed**, or comments on it while it is open; close it once a
run passes again. The release smokes the VSIX it is about to upload: each job that publishes to the
VS Code Marketplace or Open VSX packages the extension, runs `npm run test:vscode` under
`xvfb-run -a` with `VSCODE_SMOKE_VSIX` set to that file (newest stable VS Code), and publishes only
when it passes; the release workflow's dry run does the same. When that smoke fails, its screenshots
and VS Code's logs are uploaded as the artifact `vscode-smoke-marketplace`, `vscode-smoke-open-vsx`
or `vscode-smoke-dry-run`.

## CI and the merge gate

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) ends with the job **`ci-ok`**, the merge
gate: it and the PR-title check (`validate-pr-title`) are the checks for the `main` ruleset to
require, in place of the single jobs, so that Dependabot's auto-merge waits for every job, the VS
Code smoke included. `ci-ok` runs after every other job of the workflow, even when one of them
failed, and passes only when each one succeeded. A failed or cancelled job fails it, and so does a
job that was skipped because a job it needs failed (a red `lint` skips `e2e` and `test-browser`; a
required check would count that skip as passed). The one skip it accepts is `dependency-review`
outside pull requests, which that job's own `if:` skips by design; such skips are listed in
`SKIPPED_BY_DESIGN`. **A new job in `ci.yml` has to go into `ci-ok`'s `needs`**, or the gate does
not wait for it; a new job that skips itself on some events by design also goes into
`SKIPPED_BY_DESIGN` for those events.

The job `vscode-smoke` calls the VS Code smoke workflow. Its first job, `changes`, decides whether
VS Code starts at all: on a pull request, a push to `main` and in the merge queue it compares the
commit with its base (the pull request's base, the commit before the push, the merge group's base)
and starts VS Code only when one of these paths changed: `package-lock.json`, any `package.json`,
`apps/vscode/**`, `packages/**` (the extension bundles the packages' sources),
`tsconfig.base.json` (esbuild compiles both bundles with its options), `vitest.config.ts` (the
smoke's Vitest project), `.github/actions/setup/**`, `ci.yml`, `vscode-smoke.yml` or
`vscode-smoke-weekly.yml`. A moved file counts under its old and its new path, so moving a file out
of `apps/vscode/**` starts it too. A missing or all-zero base, a base it cannot fetch, the weekly
schedule and a manual run always start it. When it skips VS Code, the job `skipped` succeeds with a
notice, so `ci-ok` sees `vscode-smoke` succeed or fail, never skip.

Dependabot groups minor and patch updates of npm packages and auto-merges them once the checks
pass, except updates of `@miragon/modeler-*` (the group `modeler-platform`): a 0.x minor of the
shell changes the chrome, and a `chore(deps)` commit is never released, so adopt those by hand with
a `fix(deps): adopt modeler-shell x.y` commit.

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
