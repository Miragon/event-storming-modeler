# Event Storming Modeler — Claude Code plugin

Two skills that teach Claude [Event Storming](https://www.eventstorming.com/) and the `.storm`
text format used by the [Event Storming Modeler](https://github.com/Miragon/event-storming-modeler).

| Skill            | What it covers                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event-storming` | Alberto Brandolini's method: the sticky grammar (actor → command → aggregate → domain event → policy → …), the three workshop levels, facilitation, and board reviews with colour-coded feedback notes.   |
| `storm-dsl`      | The `.storm` format itself: full grammar, the `(color …)` `(id …)` `(on …)` `(size …)` `(align …)` suffixes, coordinates and layout, per-level authoring rules, escaping, parser diagnostics, round-trip. |

Together they let Claude read, review, edit and generate Event Storming boards as plain text —
in any repository, not just this one.

## Install

```
/plugin marketplace add Miragon/event-storming-modeler
/plugin install event-storming-modeler@event-storming
```

From a local checkout instead:

```
/plugin marketplace add /path/to/event-storming-modeler
/plugin install event-storming-modeler@event-storming
```

Once installed the skills are available everywhere as `event-storming-modeler:event-storming` and
`event-storming-modeler:storm-dsl`. They load on demand — the always-on cost is roughly 600 tokens.

## Using them

Nothing to invoke by hand. The skills trigger when you ask Claude to work on Event Storming:

- "Review this board and tell me what's weak" → `event-storming`
- "Generate a `.storm` board for our checkout process" → both
- "Why does this arrow not show up in my `.storm` file?" → `storm-dsl`

You can also call them explicitly with `/event-storming-modeler:storm-dsl`.

## A `.storm` board in 30 seconds

```
title Order Checkout
level design
actor Customer [80, 300]
command Place Order [240, 300]
aggregate Order [440, 290]
event Order Placed [640, 300]
policy When order placed, ship it [840, 300]
Customer -> Place Order
Place Order -> Order
Order -> Order Placed
Order Placed -> When order placed, ship it
```

Open it in the [web editor](https://event-storming-modeler.netlify.app) or the
`miragon-gmbh.event-storming-modeler` VS Code extension, or parse it with
[`@miragon/event-storming-dsl`](https://www.npmjs.com/package/@miragon/event-storming-dsl).

## Development

The skills are plain markdown under `skills/`. After editing, validate them:

```bash
claude plugin validate plugins/event-storming-modeler --strict
claude plugin validate .            # the marketplace manifest
```

Keep `version` in `.claude-plugin/plugin.json` and the matching entry in the repository's
`.claude-plugin/marketplace.json` in sync — `claude plugin tag` enforces it.

## License

MIT — see the [repository LICENSE](https://github.com/Miragon/event-storming-modeler/blob/main/LICENSE).
