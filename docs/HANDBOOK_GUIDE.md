# Handbook writing guide

Claude follows this guide whenever it writes or updates anything in `docs/topics/`, `docs/STUDY_NOTES.md` or `docs/DECISIONS.md`.
The handbook is written and maintained by **Claude**. The user is the reader and the builder.

## Audience and purpose
- The reader is the user, **revising before a system design / backend interview**.
- Focus on **system design thinking and problem solving**:
  - what problem a technique solves,
  - the mental model,
  - trade-offs and when to choose what,
  - failure modes,
  - how to reason about and diagnose a problem,
  - capacity and scaling thinking,
  - how to structure an answer out loud.

## What to include
- Key technical details **only when they matter for reasoning** (e.g. what a consumer group guarantees, why a lost update happens, what an isolation level prevents).

## What NOT to include
- Step-by-step setup, config flags, CLI recipes, "enable this setting" instructions.
- Library API tutorials. Those belong in official docs.
- Long prose where a diagram, a table or a worked scenario would do.

## Style
- Short, scannable chapters. Prefer a small diagram, a trade-off table or a worked scenario.
- Plain English, short sentences, one idea per bullet.
- Use **real moments from this project** (bugs, reviews, experiments, decisions) as worked examples whenever possible. Link them: issue `#N`, PR, experiment name from `docs/EXPERIMENTS.md`.
- Numbers beat adjectives ("p99 went 800 ms -> 40 ms after the index", not "much faster").

## Topic chapter format
Every file in `docs/topics/` has exactly these sections, in this order:

1. **The problem it solves**
2. **Mental model**: the core idea in a few sentences, diagram if it helps
3. **Trade-offs and when to choose what**
4. **Failure modes and how to reason about them**
5. **Key details that matter**: only what is needed to reason correctly
6. **In 30 seconds**: a short answer to say out loud, plus typical follow-up questions with brief answers
7. **In Live Pulse**: where and how the topic shows up in the project (links to issues, PRs, experiments)
8. **Lessons from building it**: real findings from the user's work

Sections 1-6 are solid reference content. Sections 7-8 start as stubs and grow with the project.

## When to update (without being asked)
After each **accepted ticket**, **merged PR** and **review**:
1. Fill or extend "In Live Pulse" and "Lessons from building it" in the affected chapters.
2. Add an entry to `docs/DECISIONS.md` when a decision was made or a review produced feedback.
3. Add a story to `docs/STUDY_NOTES.md` when something is worth retelling (a bug, an incident, a surprising measurement).
4. Update `docs/PYTHON_NOTES.md` when a new Python construct appeared.
5. **Keep "In 30 seconds" in sync**: if the chapter's understanding changed, the summary and follow-ups change too.
6. Fix anything in sections 1-6 that the project proved wrong or incomplete.

Report what changed in a short summary (files + one line each).

## Stories (`docs/STUDY_NOTES.md`)
Format: **Situation -> How it was diagnosed -> Fix -> Takeaway.** Facts from real history only (issues, PRs, experiments). Never invent.
Each story should be retellable in about 60 seconds.

## Decision log (`docs/DECISIONS.md`)
Each entry: date, issue/PR, decision, alternatives considered, reasoning, reviewer feedback (BLOCKER / SHOULD-FIX / NIT), what changed, lesson.

## Structuring an answer out loud
The "In 30 seconds" sections should model this shape:
1. One-sentence definition + the problem it solves.
2. The key trade-off.
3. A failure mode or an example from Live Pulse.
4. When you would NOT use it.

## Accuracy
If unsure about a fact, verify (docs, experiment) or say it is unverified. A wrong handbook is worse than a short one.
