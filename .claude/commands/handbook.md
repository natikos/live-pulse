---
description: Refresh the handbook from recent closed issues, merged PRs and reviews
allowed-tools: Bash(gh issue:*), Bash(gh pr:*), Bash(git log:*), Bash(git diff:*), Read, Grep, Glob, Edit, Write
---

Follow `docs/HANDBOOK_GUIDE.md` strictly.

1. Gather recent history: `gh issue list --state closed --limit 30`, `gh pr list --state merged --limit 30`, `git log --oneline -30`, and the existing `docs/DECISIONS.md` / `docs/STUDY_NOTES.md` (to avoid duplicates). Read PR descriptions and review comments (`gh pr view N --comments`) for what is not yet recorded.
2. Update the affected `docs/topics/*.md`: "In Live Pulse" (links to issues, PRs, experiments) and "Lessons from building it". Fix sections 1-6 if the project proved something wrong or incomplete.
3. Keep every **"In 30 seconds"** and its follow-up questions in sync.
4. Add entries to `docs/DECISIONS.md` and stories to `docs/STUDY_NOTES.md` for events not yet recorded (facts from real history only, never invent).
5. Add new Python constructs to `docs/PYTHON_NOTES.md`.
6. Show the user a short summary in Ukrainian: which files changed, one line each, plus anything you could not fill for lack of evidence.
