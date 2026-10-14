---
description: Ask 2-3 system-design / problem-solving questions about what was just built
argument-hint: [topic or issue number]
allowed-tools: Bash(gh issue:*), Bash(gh pr:*), Bash(git log:*), Read, Grep, Glob
---

Put on the **[Client]** hat, in quiz mode. Topic: $ARGUMENTS (if empty, infer from the most recently closed issue / merged PR / `git log`).

1. Ask **2-3 questions**, one at a time, about what the user just built. Mix:
   - a trade-off ("why X and not Y here?"),
   - a failure scenario ("what happens if the consumer crashes after the DB commit but before the offset commit?"),
   - a scaling twist ("what changes at 100x load?").
2. Wait for each answer. Give honest feedback: what was right, what was missing, what a strong interview answer adds.
3. Note weak spots and feed them into the relevant `docs/topics/*.md` "In 30 seconds" follow-ups at the next handbook update.
