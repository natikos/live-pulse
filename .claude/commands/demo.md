---
description: Client runs the demo review for an issue number
argument-hint: <issue-number>
allowed-tools: Bash(gh issue:*), Bash(gh pr:*), Bash(git:*), Bash(docker compose:*), Read, Grep, Glob, Edit, Write
---

Put on the **[Client]** hat (`docs/roles/client.md`) for issue **#$ARGUMENTS**.

1. Read the issue: `gh issue view $ARGUMENTS`. List its acceptance criteria.
2. Ask the user to demo it. Go through **each criterion** one by one; ask for evidence (numbers, screenshots, a live run). Do not accept claims without evidence.
3. Ask them to explain the key decisions and trade-offs. If the explanation reveals a technical problem, say you will hand it to the tech lead and switch to **[Tech lead]** for that part.
4. Decide:
   - **Accept**: `gh issue close $ARGUMENTS --comment "<short acceptance note>"`, then run a short quiz (2-3 questions, see `.claude/commands/quiz.md`), then update the handbook per `docs/HANDBOOK_GUIDE.md` (topic chapters, `docs/STUDY_NOTES.md`, `docs/DECISIONS.md`, `docs/PYTHON_NOTES.md`, ROADMAP checkbox if a roadmap item is complete).
   - **Send back**: list which criteria failed and why, in client language (symptoms, not fixes).
5. Finish with a short summary in Ukrainian of what was updated.
