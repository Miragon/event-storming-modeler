---
paths:
  - '**/package.json'
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `package.json`.
Always pin to an exact version (e.g. `"eslint": "9.39.4"`).

This applies to `dependencies` and `devDependencies` — including internal
`@miragon/event-storming-*` workspace deps, which pin to the referenced package's **current
version** (e.g. `0.1.0`), not a range (`*`). npm links the local workspace because the local
version satisfies the pin. release-please keeps every internal dep reference in sync on each
release via the **`node-workspace` plugin** in `release-please-config.json` — it automatically
bumps dependency and peer-dependency pins whenever a workspace package is released, so no
per-dependency config entries are needed (see [`CLAUDE.md`](../../CLAUDE.md) → Releases). Exact
pinning is enforced in CI by
[`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies).

## Exception: `peerDependencies` for consumer-shared runtime libs use ranges

Third-party runtime libraries whose identity must be shared with the consumer's own copy — `zod`
(schema-model) and `diagram-js` / `didi` / `tiny-svg` (renderer) — are declared as
`peerDependencies` with a **caret range** (e.g. `"zod": "^4.6.4"`), not an exact pin. An exact
`dependency` forces a second, duplicate copy into the consumer's tree, which breaks `instanceof`
checks, Zod schema identity and diagram-js/didi dependency injection. Ranged peers let consumers
dedupe against a single copy within the major.

Each ranged peer is mirrored by an **exact** `devDependency` (e.g. `"zod": "4.6.4"`) so local
build/test stay reproducible, and the bundling apps (`apps/webapp`, `apps/vscode`) declare the same
exact versions as regular `dependencies`. This exception does **not** apply to internal
`@miragon/event-storming-*` peers, which stay exactly pinned (kept in sync by release-please).
`miragon/pin-npm-dependencies` does not check `peerDependencies` by default, so these ranges pass
`pin-check`.

`pin-check` therefore also misses a bump that moves the exact pins out of a peer range, which makes
the published package uninstallable next to the version this repo ships with (`ERESOLVE`).
[`packages/renderer/test/peer-dependencies.sync.test.ts`](../../packages/renderer/test/peer-dependencies.sync.test.ts)
(`npm test`) catches it: every mirror, and every exact version a workspace depending on the package
declares, must satisfy the peer range. When a major bump fails it, widen the range instead of
replacing it while another peer still depends on the older major, e.g.
`"didi": "^11.0.0 || ^12.0.0"` (diagram-js 15 depends on didi 11).

When adding a new dependency: install it first with `npm install <pkg>` (the root `.npmrc` sets `save-exact=true`, so npm pins the exact version), then verify the installed version with `npm ls <pkg>` or in `package-lock.json` and make sure that exact version is written into `package.json`.
