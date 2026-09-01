# Event Storming — Concepts

Event Storming was created by **Alberto Brandolini** (_Introducing EventStorming_,
https://www.eventstorming.com). It is a workshop format that puts domain experts and developers in
front of an unlimited modelling surface and lets them explore a business domain as a **timeline of
domain events**. It scales from a whole-business overview down to the design of a single aggregate,
and it is the most common on-ramp into **Domain-Driven Design** (DDD): the clusters and boundaries
that emerge on the board are candidate **bounded contexts** and **aggregates**.

## The sticky-note types

This modeler renders each concept as a colored sticky (fills below match the renderer):

| Sticky              | Fill      | Meaning                                                                                                                                   |
| ------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain Event**    | `#FFB84D` | Something relevant that **happened** in the domain. Past tense: `Order Placed`. The backbone of every board.                              |
| **Command**         | `#7EC8F0` | An intention/decision that **causes** an event. Imperative: `Place Order`. Issued by an actor or a policy.                                |
| **Actor**           | `#FFF9B1` | The person/role issuing a command: `Customer`, `Warehouse Clerk`.                                                                         |
| **Aggregate**       | `#FFE066` | The consistency boundary (DDD) that **accepts commands and emits events**: `Order`. Often discovered late — don't force it early.         |
| **Policy**          | `#C9A0DC` | An automation or business rule: **"whenever _event_, then _command_"**: `When order placed, ship it`. The glue between events & commands. |
| **Read Model**      | `#A8D08D` | The information an actor needs **to decide** on a command: `Order Status`.                                                                |
| **External System** | `#F4A6C0` | A third-party or out-of-scope system producing/consuming events: `Payment Provider`.                                                      |
| **Hotspot**         | `#E85D75` | Conflict, uncertainty, open question, or friction: `Double payment on retry?`. Capturing problems **is** a workshop result.               |
| **Note**            | `#ECECEC` | Free-form annotation — legend, session metadata, review feedback.                                                                         |

## The sticky grammar (the picture that explains everything)

The core causal loop, read left to right:

```
actor → command → aggregate → domain event → policy → command → …
                                   ↘ read model → actor (decides next command)
external system ↔ events at the boundary
```

- An **actor**, informed by a **read model**, issues a **command**.
- An **aggregate** (or **external system**) handles the command and emits one or more
  **domain events**.
- A **policy** reacts to an event ("whenever …") and issues the next command — this is where most
  automation and most modelling insight lives. A missing policy between an event and the command it
  obviously triggers is the classic gap to probe.
- **Hotspots** go wherever people disagree or knowledge is missing.
- In real workshops, actors, hotspots and notes are often **pinned** directly onto the sticky
  they refer to — an actor stuck on its command, a hotspot on the problematic event, a note
  annotating a flow element. The modeler supports this: drop an actor/hotspot/note onto a host
  sticky to attach it; it then moves together with the host (DSL: the `(on <Host Name>)` suffix).

## The three levels

1. **Big Picture** — the whole business flow, many people, events only (plus hotspots and
   actors/external systems as needed). Goal: shared understanding, conflict surfacing, scope.
2. **Process Modeling** — one process end-to-end with the full grammar (commands, policies, read
   models). Goal: a consistent, gap-free flow you could implement or improve.
3. **Software Design** — zoom into one part; aggregates become explicit, events/commands get exact
   names, invariants and consistency boundaries are decided. Output feeds directly into DDD
   tactical design.

A `.storm` board records its level with the optional `level` statement (absent = `design`).
Each level maps to the sticky kinds the editor offers for creation — annotations (`note`,
drawings) are always available on top:

| Level       | DSL value     | Sticky kinds offered                                                      |
| ----------- | ------------- | ------------------------------------------------------------------------- |
| Big Picture | `big-picture` | `event`, `actor`, `external`, `hotspot`                                   |
| Process     | `process`     | `event`, `command`, `actor`, `policy`, `readmodel`, `external`, `hotspot` |
| Design      | `design`      | the full grammar — adds `aggregate` to the process set                    |

The level filters creation surfaces only; existing elements of any kind stay valid and editable
on every level.

## Timeline, pivotal events, swimlanes

- **Timeline:** events are ordered left → right by when they happen. Enforcing the order is the
  single most productive act of the workshop — sorting forces the conversations that expose
  inconsistencies.
- **Pivotal events** are the handful of events that mark a phase change (`Order Placed`,
  `Order Shipped`, `Order Cancelled`). They segment the timeline and are prime candidates for
  **bounded-context boundaries**: the language often changes on either side of a pivotal event.
- **Swimlanes** are horizontal lanes (per actor, team or system) used when parallel flows make one
  line unreadable. On this modeler, use consistent y bands per actor/system — the free canvas has
  no built-in lanes.

## From board to design (DDD hand-off)

- Clusters of events sharing language and data → candidate **bounded contexts**.
- The sticky that answers "what accepts this command and guarantees consistency?" → an
  **aggregate**.
- Policies → domain services, process managers, or plain event handlers.
- Read models → queries/projections shaped by the actor's actual decision.
- Hotspots → the risk list; resolve them before committing to a design.

## Review heuristics (common smells)

- Event not in past tense, or describing a wish rather than a fact (`Send email` — that's a
  command or a policy outcome).
- Command with no actor or policy issuing it (who decides this? when?).
- Event with no source — no aggregate or external system emits it.
- Event → command jump with no policy in between (hidden automation or hidden human step).
- Actor deciding without a read model (what information do they act on?).
- A suspiciously smooth board with zero hotspots — real domains have friction.
- Everything in one giant aggregate, or aggregates introduced before the event flow is stable.
