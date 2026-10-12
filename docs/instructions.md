# Jira ticket workflow

Follow these steps every time a Jira ticket (`OW-xxx`, e.g. https://thirtyplus.atlassian.net/browse/OW-1) is shared.

1. **Ask where to work before doing anything else.** Ask whether the work should happen in the current working tree or in a separate, session-based worktree checked out for this ticket. Wait for the answer.
2. **Create a branch** off an up-to-date `master`. Pick the prefix from the kind of work:
   - `feature/`: new behaviour
   - `fix/`: bug fixes
   - `chore/`: tooling, deps, config, docs
   - `refactor/`: restructuring with no behaviour change
   - `test/`: test-only changes

   Format: `<prefix>/OW-<number>-<short-kebab-summary>`, e.g. `feature/OW-12-leads-list-filters`.

   In a new worktree, run `npm install` and `direnv allow` (the git-ignored `.envrc` is not copied into worktrees: recreate it with `source_env ../rwlabs_operator_service/.envrc`, adjusting the relative path to the worktree's depth).
3. **Do the work** following `CLAUDE.md` (and `AGENTS.md`, which is what the PR will be reviewed against). Before finishing, run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build`, and `npm run e2e` when routes or pages changed. All must pass with zero failures and zero lint warnings.
4. **Raise a PR** against `master` (remote `origin`, `raunjon/rwlabs-operator-web`). Fill in `.github/pull_request_template.md`, put the ticket key in the PR title, and link the ticket in the description. Create it with `gh` through direnv so it runs as `raunjon`: `direnv exec . gh pr create ...`.
