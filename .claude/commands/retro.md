---
description: End-of-stage retro
argument-hint: [stage]
allowed-tools: Bash(gh issue:*), Bash(gh pr:*), Bash(git log:*), Read, Grep, Glob, Edit, Write
---

End-of-stage retro for stage: $ARGUMENTS (if empty, the stage that is currently finishing).

1. Run the `/handbook` logic first (see `.claude/commands/handbook.md`).
2. List the stage's issues (`gh issue list --milestone "<stage milestone>" --state all`) and compare with the stage in `docs/ROADMAP.md`.
3. Update the ROADMAP checkboxes **only for items whose definition of done is actually met** (check the evidence in closed issues and experiments).
4. Summarize in Ukrainian:
   - what the stage taught (3-5 bullets, tied to concrete moments),
   - which experiments in `docs/EXPERIMENTS.md` were done and which were skipped,
   - **which topics to revisit** (based on weak quiz answers, BLOCKER findings, skipped experiments), with chapter links,
   - what the next stage needs from this one.
5. Ask whether to continue to the next stage or fill gaps first.
