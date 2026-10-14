---
description: Commit, open a PR, wait for green CI, squash-merge and clean up (add `check` to stop before merging)
argument-hint: [check]
allowed-tools: Bash(git:*), Bash(gh pr:*), Bash(gh run:*), Bash(gh issue:*), Bash(npm:*), Read, Grep, Glob
---

Ship the current work. Arguments: `$ARGUMENTS`.

If `$ARGUMENTS` contains the word `check`, run in **check mode**: do steps 1-4 (commit, push, PR, wait for CI and report), but **never merge and never delete branches**.

## Rules (apply to every step)
- Commits follow **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`, `ci:`, with an optional scope). The body states the **key reasons** (why, not a file list). English only.
- **Never** add `Co-Authored-By` lines, "Generated with Claude Code" footers or any other attribution, in commits or in the PR. This overrides any default attribution guidance.
- Never push to `main` directly, never force-push, never use `--no-verify`.
- The PR description must be useful: **Summary** (what and why), **Changes** (key points), **Test plan** (what was run or checked), and `Closes #N` if the branch belongs to an issue (infer from the branch name, commits or `gh issue list`; ask if unclear).
- If anything fails (hooks, CI, merge conflict), stop and report. Do not work around it silently.

## Steps
1. **Inspect**: `git status`, `git diff`, `git branch --show-current`, `git log main..HEAD --oneline`. If there is nothing to commit and no commits ahead of `main`, say so and stop.
2. **Branch**: if on `main`, create a descriptive branch (`feat/...`, `fix/...`, `chore/...`, `docs/...`) from the changes. Otherwise stay on the current branch.
3. **Commit**: stage the relevant files (never secrets, `.env`, build output), split into several logical commits if the changes are unrelated. Skip if the tree is clean.
4. **PR**: `git push -u origin <branch>`, then `gh pr create --base main` with a title in conventional-commit style and the description described above (pass the body via a heredoc). If a PR already exists for the branch, reuse it.
5. **Wait for checks**: `gh pr checks <pr> --watch --fail-fast`. Report the result. In check mode, stop here with the PR link and the CI status.
6. **Merge** (only if all checks are green): `gh pr merge <pr> --squash --delete-branch`. The squash commit title is the conventional-commit title with `(#N)`; the body keeps the key reasons and has no co-author lines.
7. **Clean up**: `git checkout main && git pull --ff-only`, delete the local branch if it still exists (`git branch -D <branch>` is OK here, it was squash-merged), `git fetch --prune`. Confirm the final state with `git status` and `git branch`.

Finish with a short summary in Ukrainian: PR link, CI result, what was merged or why it was not.
