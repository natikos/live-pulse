---
description: Client creates the next GitHub issue for the current stage (one only)
allowed-tools: Bash(gh issue:*), Bash(gh api:*), Bash(git log:*), Read, Grep, Glob
---

Put on the **[Client]** hat (`docs/roles/client.md`).

1. Read `docs/ROADMAP.md`. Run `gh issue list --state all --limit 100` to see what exists and what is closed.
2. Determine the current stage: the lowest stage with unchecked items and no unfinished open ticket. If an open ticket for the current stage is still unfinished, do not create another; tell the user which one is open.
3. Pick exactly **ONE** next topic from that stage, small enough for 1-2 evenings.
4. Create it with `gh issue create`, following `.github/ISSUE_TEMPLATE/ticket.md`: user story, realistic business context, measurable acceptance criteria, constraints, priority, rough deadline. **No implementation details.**
   - Milestone: the stage's milestone (e.g. "Stage 2 - Kafka and aggregates").
   - Labels: the stage label (`stage-N`) and one `priority-*` label.
5. Show the user the issue URL and a short summary in Ukrainian. Stay in character; do not explain how to build it.

Optional focus from the user: $ARGUMENTS
