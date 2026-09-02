---
paths:
  - '**/package.json'
---

# Always use fixed dependency versions

Never use version ranges (`^`, `~`, `>=`, `*`) in `package.json`.
Always pin to an exact version (e.g. `"eslint": "9.39.4"`).

This applies to `dependencies`, `devDependencies`, and `peerDependencies` — including internal
`@miragon/event-storming-*` workspace deps, which pin to the referenced package's **current
version** (e.g. `0.1.0`), not a range (`*`). npm links the local workspace because the local
version satisfies the pin. release-please keeps every internal dep reference in sync on each
release via the **`node-workspace` plugin** in `release-please-config.json` — it automatically
bumps dependency and peer-dependency pins whenever a workspace package is released, so no
per-dependency config entries are needed (see [`CLAUDE.md`](../../CLAUDE.md) → Releases). Exact
pinning is enforced in CI by
[`miragon/pin-npm-dependencies`](https://github.com/Miragon/pin-npm-dependencies).

When adding a new dependency: install it first with `npm install <pkg>` (the root `.npmrc` sets `save-exact=true`, so npm pins the exact version), then verify the installed version with `npm ls <pkg>` or in `package-lock.json` and make sure that exact version is written into `package.json`.
