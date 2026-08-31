# Learn the basics

## What is Event Storming?

Event Storming is a workshop format invented by Alberto Brandolini for exploring a business
domain together: everyone puts sticky notes on a wall, telling the story of the domain along a
timeline. It works at three levels of detail:

- **Big picture** — map an entire business line with domain events to build shared understanding.
- **Process modeling** — zoom into one process: which commands trigger which events, and which
  policies react to them.
- **Software design** — refine the picture towards aggregates and read models, ready for
  domain-driven design.

## Reading a board

Each sticky color has a meaning:

- **Domain Event** (orange) — something that happened, phrased in past tense ("Order Placed").
- **Command** (blue) — an intent that triggers a change ("Place Order").
- **Actor** (light yellow) — the person issuing commands.
- **Aggregate** (yellow) — the part of the system that accepts commands and emits events.
- **Policy** (purple) — a reaction: "whenever X happens, do Y".
- **Read Model** (green) — the data someone looks at to make a decision.
- **External System** (pink) — a third party outside your control.
- **Hotspot** (red) — an open question, conflict, or risk worth flagging.

Time flows **left to right**: earlier events sit to the left of later ones. Arrows connect the
stickies into a story.

## Editing a board

- **Add and connect** — use the palette and context pad to place stickies and draw arrows between
  them.
- **Move and rename** — drag a sticky anywhere on the free canvas, or click its label to rename.
- **Undo and redo** — `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`.
- **Export** — the menu in the top-right corner fits the view and exports the board to SVG or PNG.

The text file and the canvas stay in sync: open the `.storm` text in a split view and watch your
edits re-render live.

New to the concept? Start with [eventstorming.com](https://www.eventstorming.com) and Alberto
Brandolini's book [Introducing EventStorming](https://leanpub.com/introducing_eventstorming).
