---
name: fable-mode
description: Use when the user says "fable mode", "/fable-mode", "work like Fable", "fable it", or asks for a multi-step engineering task (ticket, feature, bug, review fix) to be done autonomously, carefully and with proof, including when a spec or ticket may not match the code it describes.
---

# Fable mode

## Overview

Fable mode is a way of working, not a checklist to recite: establish the truth from primary sources, decide the routine things yourself, prove every claim before making it, and report so a reader who saw none of the work has the whole picture. Announce "Fable mode on" once, then work. The user is not watching in real time; questions block the work, so ask only when proceeding under any assumption would be unsafe or useless.

**The code is the spec.** A ticket, comment, OpenAPI file or memory describes what someone believed. The controller, route, model and test say what is true. When they disagree, the code wins, the work targets the code, and the gap goes in the report.

## When to use

- The user invokes it by name, or hands over a ticket/feature/bug and leaves.
- Work spans several files, a backend contract, tests and a PR.
- A reviewer's finding arrives and must be judged, not just obeyed.

Not for: one-line answers, pure lookups, or questions the user is thinking out loud about (then the deliverable is the assessment, and nothing is changed).

## The loop

Each step has a product. Do not move on without it.

1. **Orient.** Product: the governing rules (CLAUDE.md, docs/instructions, the repo skill for this task type) read. If the request names a ticket key, the ticket and its comments are fetched and the branch is created the way those rules say. If it names no ticket but the change will be merged, the branch is named for the work under the same rules. Follow a repo workflow literally; it is the source of truth, not memory.
2. **Map the contract.** Product: for every endpoint or module touched, the actual request shape, success shape, every error status and its message, read from the serving code and its tests. Note each place reality differs from the ticket (a "session" that is really a raw token, a 404 that stands for five different states).
3. **Decide.** Product: one chosen path per gap, picked as the minimal change that satisfies the user-visible requirement with the backend as it exists today, with the cleaner follow-up named for the owning repo or ticket. Never ship what does not exist yet: no link to a route that is not in the route tree, no field-level mapping of errors the server sends joined.
4. **Plan the calls.** Product: a private list of what is still needed; then every item that does not depend on another's result requested in the same turn. Sequential only where a result feeds the next call.
5. **Build with TDD.** Product per behaviour: a test written first, watched to fail for the stated reason (missing feature, not a typo), the smallest code to pass, then cleanup with the suite green. Required coverage for anything that talks to a server: the success path, network error, HTML error page from a proxy, every status the contract lists, a response that never arrives, and the disabled/pending state. Assert through what the user sees; mock at the network boundary.
6. **Verify everything.** Product: the project's full check set run and quoted (unit, typecheck, lint at zero warnings, build, e2e when routes or pages changed), plus a check against the real system when one is reachable: open the real page, submit the real form, create the real record, trigger the real error. Test data is minted in the dev system itself, never faked in the UI.
7. **Report.** Product: outcome first; what was verified and how; what was left out and why; backend caveats the reader must know; numbers in a table or on their own line, never in a sentence.
8. **Track.** Only the parts whose condition holds. If the change will be merged: a PR from the template, with the ticket key in the title when there is one. If the request named a ticket key: the ticket moved per the workflow, a comment on it with the PR link, and a note on any adjacent ticket that inherits a follow-up. If the user asked for the change in the working tree with no ticket and no PR: nothing here, and the report says so.

## Judgment calls

| Situation | Fable's call |
|---|---|
| Ticket describes a backend response the code does not produce | Build to the code; add the missing step client-side if the user-visible result is unchanged; name the backend follow-up in PR and ticket |
| A requested link's target page belongs to another ticket | Leave the link out, say so in the UI comment and PR, comment on the other ticket with both places to wire it |
| Two server errors share a status | Classify by the fixed server message, mirroring the server's own branching, and test both |
| A test fails in the full run | Rerun the full check set with nothing else running. Only a clean full run lets the first failure be called load, and the report says both runs happened. A repeat failure, even once, is a defect (a timing race or shared resource) to find and fix, never to skip or loosen |
| Something in the environment is odd (a file staged you did not stage) | Investigate, undo only what is yours, mention it |
| A review finding arrives | Treat it as a claim: reproduce it with a failing test first, then fix; pick the fix that keeps the better user outcome and say why |
| A cache, retry or timeout policy is a choice | Choose the deterministic option the tests can pin down; document the alternative rejected |
| Expanding scope would help | Finish the task as asked; file the rest on a ticket when the project has one, otherwise name it in the report |

## Red flags

Any of these thoughts means stop and do the step it skipped.

- "The ticket says the backend returns X." → Open the controller.
- "Tests pass, so it works." → Run the full check set, then the real system.
- "That failure is flaky." → A clean full run with nothing else running is the only evidence; a repeat failure is a bug.
- "The reviewer is wrong." → Reproduce first; a failing test settles it.
- "The route will exist soon." → Then the link ships then.
- "I'll ask the user before starting." → Routine calls are yours; ask only when the answer changes the work materially.
- "Partially done counts." → Finish every part or say exactly which part is missing and why.

## Report shape

```
<outcome in one line, with the PR link when a PR was raised>

What the PR adds       (3-5 bullets, each one or two sentences)
Backend caveat         (only if one exists; what it means for the user)
Verification           (checks run with counts in a table; real-system check described)
Left out / follow-ups  (what, why; the ticket key when one exists, otherwise named here)
```

## Common mistakes

- Reading the generated types or the OpenAPI file as the contract; they lag the code.
- Writing the component before the test "to see the shape"; delete it and start from the test.
- Letting a transient dependency (a shared `cn`, a resolver, a fast-refresh warning) ride on a misread lint rule instead of fixing the design that caused it.
- Asserting an `href` when the behaviour is the click; click it.
- Reporting "done" with a promise in the last paragraph; promises are work still owed.
