# Facilitating an Event Storming workshop

Practical guidance for running a session (after Alberto Brandolini's _Introducing EventStorming_;
original prose). Useful both for facilitating real workshops and for structuring an asynchronous or
tool-based session on a `.storm` board.

## Preparation

- **Invite the right people:** the ones with the questions (developers, designers) **and** the ones
  with the answers (domain experts, product, ops). Cross-silo attendance is the point — a workshop
  with only engineers models the code, not the domain.
- **Unlimited modelling surface:** in the physical version, a paper roll on a long wall; here, the
  free canvas. Space constraints kill exploration — never squeeze the timeline.
- **Little upfront agenda:** state the scope ("from first visit to delivered order") and the
  notation, then start storming. Chairs away — standing keeps energy up.

## Phases

1. **Chaotic exploration.** Everyone writes domain events (past tense, orange) in parallel and
   sticks them roughly where they belong in time. No filtering, duplicates welcome — duplicates are
   signal (same concept, different words = language mismatch worth a hotspot).
2. **Enforce the timeline.** Sort events left → right; merge duplicates deliberately. This is where
   the real conversations happen — inconsistencies, missing steps, and disagreements surface.
   Capture every unresolved dispute as a **hotspot** and move on; do not let one argument stall the
   room.
3. **Pivotal events & structure.** Mark the few events where the process changes phase; they
   segment the board. Add **swimlanes** (per actor/system) if parallel flows tangle.
4. **People and systems.** Add actors and external systems. Ask "who does this?" and "where does
   this come from?" for every stretch of events with no visible cause.
5. **Walk the flow with the full grammar** (process/design level). For each event, work backwards:
   which command caused it, who or which policy issued the command, which aggregate handled it,
   which read model informed the decision. Phrase policies out loud as "whenever …, then …".
6. **Reverse narrative check.** Walk the board right → left, asking for each event "what had to be
   true for this to happen?" — it reliably exposes missing events and hidden assumptions.
7. **Close.** Review hotspots, pick the ones to resolve next, photograph/save the board, and agree
   on follow-ups (deeper design-level sessions on chosen contexts).

## Facilitator moves

- **Model the notation, don't lecture it.** Put up the first few stickies yourself; a visible
  legend (a `note` sticky) beats a slide.
- **Protect the timeline.** Whenever someone talks solutions too early, ask "which event is that
  about?" and park the rest as a hotspot.
- **Chase the gaps.** Long stretches with no actor, commands with no cause, events nobody can
  explain — point at them and ask.
- **Watch the quiet people.** The person hesitating in front of a sticky usually knows something
  the sticky's author does not.
- **Timebox mercilessly.** Better a rough complete flow than a polished fragment.

## Anti-patterns

- Turning the session into a documentation exercise — the artifact matters less than the shared
  understanding (though with this tool the board _is_ durable; still, conversation first).
- Letting one expert dictate the flow while others watch.
- Zero hotspots (nobody is being honest) or all hotspots (scope too broad or wrong room).
- Introducing aggregates in the first hour — structure emerges from the event flow, not before it.
- Modelling the ideal process while everyone knows the real one differs — storm what **is**, then
  mark what **should** change.
