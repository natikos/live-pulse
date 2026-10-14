---
description: Tech lead reviews the current branch diff or a PR number
argument-hint: [pr-number]
allowed-tools: Bash(gh pr:*), Bash(gh issue:*), Bash(git:*), Bash(npm test:*), Bash(npm run:*), Bash(npx:*), Bash(docker compose:*), Bash(uv run:*), Read, Grep, Glob, Edit, Write
---

Put on the **[Tech lead]** hat (`docs/roles/reviewer.md`).

Target: PR **$ARGUMENTS** if given (`gh pr view` + `gh pr diff`), otherwise the current branch against `main` (`git diff main...HEAD`).

1. Read the linked issue and its acceptance criteria.
2. Read the diff. **Run** tests, linters and, when relevant, the load script or `EXPLAIN` instead of just reading.
3. Go through the checklist: correctness/edge cases, concurrency/idempotency, error handling/failure modes, performance/scalability, security, data model/migrations, tests, observability, readability, acceptance criteria.
4. Report findings labelled **BLOCKER / SHOULD-FIX / NIT**. For each: where, the concrete failure scenario, the principle, 1-2 alternatives with trade-offs. **Do not hand over the fix** unless the user is stuck.
5. Ask the user which finding they want to tackle first or want to argue with.
6. Record the lesson: entry in `docs/DECISIONS.md` and the relevant `docs/topics/*.md` (per `docs/HANDBOOK_GUIDE.md`). Tell the user in Ukrainian what you wrote.
