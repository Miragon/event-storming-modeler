---
name: event-storming
description: >-
  Event Storming expert. Explains Alberto Brandolini's Event Storming method and the `.storm` text
  DSL this project uses, teaches the sticky-note grammar (actor → command → aggregate → domain
  event → policy → …) and the three workshop levels (big picture, process modeling, software
  design), and reviews a user's board — what is good, what is weak, and where the potential is —
  adding colour-coded feedback notes directly to the .storm file. Use whenever the user asks to
  review, critique, improve, or sanity-check an Event Storming board; to explain Event-Storming
  concepts (domain events, commands, aggregates, policies, hotspots, pivotal events, swimlanes,
  bounded contexts); or to read/write .storm files.
---

# Event Storming

Event Storming (Alberto Brandolini) is a **workshop format for exploring a business domain
together**: participants storm the domain as **domain events** on sticky notes, arrange them on an
unbounded **timeline** (left → right = earlier → later), then enrich the picture with commands,
actors, aggregates, policies, read models, external systems and hotspots. This skill lets you
(1) explain the method, (2) read/write the `.storm` text DSL these files use, and (3) review a real
board and return actionable, colour-coded feedback.

## The board (always check these first)

- **Timeline.** Events flow left → right in temporal order. The x coordinate is the ordering; the
  board is a free canvas (pixel coordinates, no grid, no axes). A board without a recognisable
  timeline of events is not really an Event Storming board yet.
- **Sticky grammar.** The core causal loop reads:
  **actor → command → aggregate → domain event → policy → command → …**, with **read models**
  informing actors' decisions and **external systems** producing or consuming events at the
  boundary. Hotspots mark conflict, uncertainty or open questions.
- **Naming.** Domain events are **past tense** (`Order Placed`), commands are **imperative**
  (`Place Order`), policies read as **"whenever X, do Y"**.

## How to review a board (the core job)

1. **Read the file** and build a mental model: events on the timeline, commands and their actors,
   aggregates that accept commands and emit events, policies reacting to events, read models,
   external systems, hotspots, and the arrows connecting them. If given an image, ask for the
   `.storm` file.
2. **Check the notation** (see `reference/concepts.md`): events past tense? Commands imperative?
   Policies phrased as reactions? Are stickies of the right kind (a "sticky" like `Send email` is
   a command or policy outcome, not an event)?
3. **Check the structure:** does every command have an actor or policy that issues it? Does every
   event have a source (aggregate or external system)? Are there policies between an event and the
   command it triggers, or do commands appear out of nowhere? Are read models present where actors
   make decisions?
4. **Check the timeline:** left-to-right order consistent? Are **pivotal events** (the few events
   that mark phase changes, e.g. `Order Placed`, `Order Shipped`) identifiable? Would **swimlanes**
   per actor/system clarify parallel flows?
5. **Mine the hotspots:** every disagreement, uncertainty or missing piece deserves a hotspot —
   flag places that look contentious but have none.
6. **Deliver feedback two ways:**
   - A short written assessment: **Strengths**, **Weaknesses / risks**, **Potential / next steps**.
   - **Colour-coded notes added to the DSL**, placed next to the sticky they comment on, so the
     user sees the feedback on the canvas. Keep each note to a few words.

## Colour convention for feedback notes

Notes accept a per-note colour override (`(color #hex)`, see `reference/dsl.md`). Use dark hues so
review notes are never confused with the pastel domain stickies:

| Colour    | Hex       | Meaning                                          |
| --------- | --------- | ------------------------------------------------ |
| 🟢 Green  | `#15803d` | Good — well modelled / a genuine strength        |
| 🟠 Amber  | `#b45309` | Watch — naming smell, unclear flow, needs a look |
| 🔴 Red    | `#b91c1c` | Problem — wrong sticky kind, missing link        |
| 🔵 Blue   | `#1d4ed8` | Info / neutral observation                       |
| 🟣 Purple | `#7e22ce` | Idea / opportunity / suggested exploration       |

Syntax: `note <short feedback> [x, y] (color #hex)`. Position the note **near** the sticky it
comments on (offset ~100–150 px so it does not overlap). Example — appending a review to a board:

```
note Clear pivotal event — good anchor [620, 180] (color #15803d)
note "Send email" is a policy outcome, not an event [860, 420] (color #b91c1c)
note Who issues this command? Add an actor [240, 420] (color #b45309)
note Candidate bounded context boundary here [900, 80] (color #7e22ce)
```

When you change a board, **preserve everything else** (round-trip the DSL — unknown lines survive
via passthrough) and only add/adjust the feedback notes unless the user asks you to move stickies.
Prefer adding notes over silently moving the user's stickies — suggest moves in notes/text and let
them decide.

## Reference files (read on demand)

- `reference/concepts.md` — the sticky-note types and grammar, the three workshop levels,
  pivotal events, swimlanes, hotspots, bounded-context discovery.
- `reference/facilitation.md` — running a workshop: preparation, phases, facilitator moves,
  anti-patterns.
- `reference/dsl.md` — the `.storm` text DSL this project reads/writes, incl. the `(color …)`
  override and a worked example.

## Authoring new boards

When asked to _create_ a board: start from the **domain events** (past tense, on a left→right
timeline), identify the pivotal events, then work backwards — which command caused each event,
which actor or policy issued the command, which aggregate handled it, which read models inform the
actor. Add external systems at the boundary and hotspots wherever you are unsure. Keep it small and
legible. Then run the review steps above on your own board before presenting it.

> Sources: Alberto Brandolini, _Introducing EventStorming_ (Leanpub), and
> https://www.eventstorming.com — the summaries in the reference files are original prose.
