---
name: working-on-ow-ticket
description: Use when the user shares a Jira ticket (OW-xxx key or a thirtyplus.atlassian.net/browse/OW-xxx link) to be worked on in rwlabs_operator_web. Covers the worktree question, branch naming, and raising the PR.
---

# Working on an OW (operator web) ticket

The workflow lives in `docs/instructions.md` at the repo root. **Read it and follow it step by step.** Don't work from memory, because the file is the source of truth.

How it fits with Jira:

- **Step 1 (ask where to work) comes before anything else**, including fetching the ticket.
- **Before naming the branch**, read the ticket with `getJiraIssue` (cloudId `thirtyplus.atlassian.net`, issue key from the link, e.g. `OW-1` from `https://thirtyplus.atlassian.net/browse/OW-1`). Its type and summary decide the prefix and the kebab summary.
- **Once the branch exists and work starts**, transition the ticket to **In Progress**.
- **After the PR is raised**, transition the ticket to **Testing** and add a comment with the PR link. Don't move it to Done; that happens when it's merged and deployed.
- The transition ids in the `tracking-thirtyplus-jira` skill (In Progress 31, Testing 41) are for the `OS` project. Look up `OW`'s own ids with `getTransitionsForJiraIssue` instead of assuming they match.
