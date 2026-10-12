---
name: writing-jira-tickets
description: Use when the user asks for a Jira ticket, story, task or bug to be created or rewritten ("create a ticket", "fable ticket", "ticket this", "write up a ticket for"), especially when the work touches an API, another repo, or a feature another ticket may already own.
---

# Writing Jira tickets

## Overview

A ticket is a contract between the person who will build it and the code that exists today. Fable writes it the way it would build it: establish the facts from the serving code first, split along repo and ownership lines, state the exact contract, say what is out, and link the pieces so the order is visible. Announce "Fable ticketing" once, then work; ask the user only when two readings of the request would produce materially different tickets.

**The code is the spec.** A ticket that promises "the server returns a session" when the controller returns a raw token is a ticket that fails in review a week later. Find that gap now and write it in.

Site-specific ids (cloud id, account id, status ids, epic keys) live in the project's tracking skill (for ThirtyPlus: `tracking-thirtyplus-jira`) and in memory; read those first, never guess them.

## When to use

- Any request to create, split, or rewrite a ticket.
- A finished piece of work left a follow-up that must not be lost.
- A dependency surfaced mid-task that belongs to another repo.

Not for: moving status or commenting on an existing ticket during normal work (the repo's `docs/instructions.md` covers that).

## The loop

Each step has a product; do not move on without it.

1. **Orient.** Product: the project's conventions in hand (epic or no epic, issue type, assignee, link type, where new tickets land), from the tracking skill, memory, and a JQL look at the project's last tickets so the new one matches its neighbours.
2. **Check ownership.** Product: a JQL search of the project for the feature's words. If another ticket owns part of the request (a reset-password page, a listing screen), that part is out of scope here and referenced by key, with a comment on the owning ticket if it gains work.
3. **Map the contract.** Product: for every endpoint or payload the ticket relies on, the serving controller, model, serializer and tests read, and these facts written down: request fields, success shape and status, every error status with its fixed message, and whether the response actually carries what the UI needs. Also the repo's branch and base conventions from its `docs/instructions.md`.
4. **Decompose.** Product: one ticket per repo per deliverable. A backend gap becomes its own ticket in the owning project, not a paragraph in the consumer's ticket. The consumer ticket keeps a dependency section that names the keys. Create consumer first with a placeholder line, create the dependencies, then edit the placeholder to the real keys.
5. **Write each ticket** in the shape below.
6. **Link.** Product: "Blocks" links from each dependency to each dependant (inward = blocker, outward = blocked), in both directions of a chain (A blocks B, B blocks C, A blocks C).
7. **Verify.** Product: the create responses re-read for the exact description text, every placeholder replaced, every link reported as created, the status left where the workflow says new tickets sit unless the user said it is ready.
8. **Record and report.** Product: the conventions memory updated with the new keys and anything learned about the project, and a report in the shape at the end.

## Ticket shape

Written for a product manager reading cold: plain English of what it does and why, with paths, endpoints and field names as backticked asides, never as the lead. Headings in bold, in this order; omit a heading only when it truly has no content.

```
**Goal**            one paragraph: who gets what, and why now
**Scope**           bullets of user-visible behaviour; each server-reported case
                    with its status and the exact message the code sends
**Out of scope**    what a reader might assume is included and is not, each
                    with where it lives instead (key, "later ticket", "backend")
**Backend dependency** (consumer tickets only) the gap in the code, the
                    tracked keys, and what the consumer does once they land
**Why this is acceptable** (only when the change loosens something: a
                    secret shown once, a public page) who sees it, what
                    already limits it, what is unchanged for everyone else
**Testing**         unit expectations and the end-to-end paths, by behaviour
**Depends on**      keys, with the reason each one matters
**Repo**            repo name, base branch, the files involved as asides
```

## Judgment calls

| Situation | Fable's call |
|---|---|
| Request assumes the backend returns something | Open the controller and serializer; if it does not, the ticket says so and a backend ticket is created |
| Part of the request is owned by another ticket | Out of scope here, referenced by key; comment on the owner naming the places that need wiring |
| Two server errors share a status | Scope lists both with their fixed messages so the implementer can branch on them |
| User rules something out ("mailers are out of scope") | An explicit Out of scope bullet, plus what still happens anyway (the mail is still enqueued) |
| A field that is secret elsewhere must be exposed | Name the single response where it appears, list every endpoint where it must not, add a logging check to Testing, write Why this is acceptable |
| Convention unknown for a project | Read its last few tickets; match type, parenting and assignee; record what was learned |
| A new ticket is a clear dependency chain | Blocks links for every pair, not just adjacent ones |
| Tempted to put the backend change in the UI ticket "to keep it simple" | Separate tickets; separate repos have separate reviewers and branches |

## Red flags

Any of these means stop and do the step it skipped.

- "The endpoint exists, so the data is there." → Read the serializer and the tests that pin the response.
- "I'll describe the backend change in the UI ticket." → Create the backend ticket in its project.
- "Links can be added later." → They are the ordering; add them now.
- "The status table from the other project will do." → Fetch this issue's transitions.
- "Done." without re-reading the created text → Open the create response; find the placeholder you left.

## Common mistakes

- Leading with class names and file paths; the PM stops reading. Lead with behaviour, keep code as asides.
- Writing "handle errors" instead of listing each status and message the code emits.
- A dependency sentence with no key, which nobody can click or query.
- Promising an exact path or message the implementer must invent; if the code fixes it (an email's link path, a server message), quote it.
- Editing a description by appending; Jira replaces the whole field, so send the full text.

## Report shape

```
<one line: keys created, with links>

| Ticket | What it asks for | Blocks |      (one row per ticket)

Choices worth knowing   (2-4 sentences: the gap found in the code, what
                         was split and why, anything the user ruled out)
Conventions applied     (one line: type, parent, assignee, status, links)
```
