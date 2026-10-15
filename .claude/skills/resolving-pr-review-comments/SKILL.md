---
name: resolving-pr-review-comments
description: Use when the user asks to address, resolve or respond to review comments on a GitHub PR, including when they share a PR URL and mention comments ("there are comments on the PR", "see the PR feedback", "address the review"). Covers fetching every open thread, judging each one, fixing with tests, committing, replying inline per thread, and ending the cycle with "@codex review".
---

# Resolving PR review comments

The job isn't done when the code is fixed. A review cycle is a loop that ends only when every open comment has been judged, every accepted comment has a fix + a reply naming the commit, every rejected comment has a reply explaining why, and the reviewer has been pinged for a fresh pass.

## The loop

1. **Fetch every open thread.** Use `gh api repos/<owner>/<repo>/pulls/<num>/comments` for inline comments and `gh pr view <num> --json comments,reviews` for the top-level ones. Dump them with path, line and body so you can see the real list — don't trust what the user said the count was. If a top-level comment summarises a review (Codex, Copilot), the inline comments under it are the actionable ones.

2. **Read each one carefully, then judge.** Not every comment is right. Three kinds come up:
   - **Legitimate:** fix it.
   - **Mistaken** (reviewer missed context, misread the code, cited the wrong rule): push back in the reply with the evidence; don't change code to appease a wrong review.
   - **Scope creep:** acknowledge, defer to a follow-up ticket, say so in the reply.
   Codex-style bots can be wrong too; verify the claim against the actual repo state before fixing.

3. **Fix with tests.** For every accepted comment, change the code AND add a focused test that fails without the fix. This is the regression guard; it also makes the reply concrete ("added a test that asserts X"). Follow the repo's TDD habits.

4. **Run the full check set.** Whatever the repo requires — typecheck, lint at zero warnings, unit tests, build, e2e when routes or pages changed. All green before committing. If e2e needs port juggling (e.g. a staging container holds the dev port), do it, restore state afterwards.

5. **Commit, author matters.** One commit per logical fix is cleanest; a single combined commit is fine when the fixes are tangled. Use the project's commit style (prefix with the ticket key if there is one) and the identity the repo expects (env vars like `GIT_AUTHOR_NAME`/`EMAIL` are safer than mutating config). Push.

6. **Reply to every inline thread.** Use `gh api -X POST repos/<owner>/<repo>/pulls/<num>/comments/<comment_id>/replies -f body="…"`. Each reply names the commit SHA and says what was done (or, for a push-back, why not). One reply per thread; don't collapse them into a single top-level comment — reviewers read threads inline.

7. **End the cycle with `@codex review`.** Once every open thread has a reply and the fixes are pushed, post a top-level comment with just `@codex review` to request a fresh pass. Do it with `gh pr comment <num> --body "@codex review"`. This is required, not optional — Codex is wired as a PR reviewer in this repo (see the chatgpt-codex-connector bot's intro) and won't re-review automatically after a push.

## When not to post `@codex review`

- Repos without the Codex connector installed (no prior Codex activity on the PR).
- Mid-cycle, when some comments are still unresolved — only when the full round is finished.
- When the user has already triggered a review themselves this cycle.

## What to put in each reply

- The commit SHA that fixed it (so a reviewer can jump straight to the diff).
- One or two lines on *what* changed — not a wall of text.
- If a test was added, name it.
- If the reviewer was wrong, show the evidence (file path, line, the actual behaviour) and skip the fix. Being right isn't rude.

## Tracking

- A TaskList with one task per comment keeps a long review cycle from losing threads mid-work.
- When the reviewer comes back with more comments, repeat the loop. One `@codex review` per cycle, not per fix.
