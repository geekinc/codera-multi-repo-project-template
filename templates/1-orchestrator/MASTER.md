# Platform Master Reference
# {{PROJECT_NAME}}

> **Every agent reads this file first, at the start of every session, without exception.**

---

## What This Platform Does

{{PROJECT_DESCRIPTION}}

---

## Repository Map

| Repo | Purpose | Owns |
|---|---|---|
| `{{PROJECT_NAME}}-orchestrator` | Contracts, specs, tasks, design | Architecture docs, task files, sub-agent prompts |
| `{{PROJECT_NAME}}-shared-types` | Shared TypeScript interfaces | npm package `{{NPM_SCOPE}}/shared-types` |
| `{{PROJECT_NAME}}-backend` | CDK infra + API (DynamoDB, SQS, API Gateway, Lambdas) | All API endpoints, infra as code |
| `{{PROJECT_NAME}}-frontend` | React + Tailwind application | All UI views, API client |
| `{{PROJECT_NAME}}-agent` | Scripts + prompts driving backend APIs | CLI tools, agent workflows |
| `{{PROJECT_NAME}}-dashboard` | Monitoring UI (charts, metrics, alerts) | Metrics views, status displays |

---

## Golden Rules — All Agents

1. **Never invent a TypeScript type** — check `{{NPM_SCOPE}}/shared-types` first
2. **Never modify a contract unilaterally** — propose changes via the orchestrator
3. **Never implement across repository boundaries without a defined contract**
4. **If a contract is missing, stop and flag it** — do not work around it
5. **All API routes are versioned** — follow the patterns in the backend repo
6. **Credentials are never logged, stored in plain text, or returned to the frontend**

---

## Architecture Reference

Full architecture reference: `../{{PROJECT_NAME}}-orchestrator/docs/ARCHITECTURE.md` (readable by agents from any repo in the workspace)

---

## Git Workflow — All Agents

### Branch Strategy
- Main branch: `main` (always deployable)
- Work branch per task: `task/TASK-NNN-short-slug`
- Create branch at task start, never commit directly to main

### Commit Cadence
Commit after every logical unit of work:
- A complete function or method
- A passing test or test suite
- A bug fix or configuration change
- Completion of an acceptance criteria checkbox

Never batch multiple logical units into one commit.
Never leave uncommitted work at session end.

### Commit Message Format (Conventional Commits)

```
<type>(<scope>): <short description>

[optional body - what and why, not how]

[Task: TASK-NNN]
```

**Types:** `feat` `fix` `chore` `docs` `refactor` `test` `types`

**Rules:**
- Present tense ("add" not "added")
- No capital first letter, no period at end
- Under 72 characters for the subject line
- Body explains *why*, not *how*
- Always reference the task

### Push Cadence
Push to remote:
- After every 3-5 commits
- Before starting significantly different work
- Before ending a session
- Immediately after any bug fix or completed acceptance criterion

### Before Every Push
Run the validation sequence for your repo (build, lint, test).
**Never push a failing build.**

---

## Code Review Process

### Agent Self-Review (before raising PR)
Every PR description must include this checklist completed:

```
[ ] All acceptance criteria met
[ ] No types defined locally that exist in shared-types
[ ] No API shapes invented without a spec in orchestrator
[ ] No hardcoded config values
[ ] No console.log in production code
[ ] All error cases handled and tested
[ ] No unresolved TODOs
[ ] Commit history is clean and logical
```

---

## Agent Startup Sequence

At the start of every session, in this order:

1. Run `bash ../{{PROJECT_NAME}}-orchestrator/sync-check.sh` — pulls orchestrator and shows current sync state
2. If `{{NPM_SCOPE}}/shared-types` version is newer than your local install: `cd ../{{PROJECT_NAME}}-shared-types && git pull && npm run build && cd - && npm install`
3. Read `../{{PROJECT_NAME}}-orchestrator/MASTER.md` (this file)
4. Read `CLAUDE.md` in your assigned repository
5. Read the relevant sections of `../{{PROJECT_NAME}}-orchestrator/docs/ARCHITECTURE.md`
6. Read the active task file in `../{{PROJECT_NAME}}-orchestrator/tasks/active/`
7. Only then begin implementation

---

## Cross-Agent Synchronisation Protocol

Multiple agents run in parallel. This protocol prevents them from colliding
on shared dependencies or building against stale contracts.

### Shared Resources (require coordination)

These resources are shared across repos. Changes to them affect all agents:

- `../{{PROJECT_NAME}}-orchestrator/docs/ARCHITECTURE.md` — Architecture decisions
- `../{{PROJECT_NAME}}-shared-types/src/index.ts` — Shared TypeScript interfaces

Changes to any of these require the Lock + Notify cycle below.

### The Lock -> Change -> Notify Cycle

**Before changing a shared resource:**
```bash
# 1. Pull latest orchestrator
cd ../orchestrator && git pull origin main

# 2. Claim a lock in SYNC.md (prevents another agent colliding)
#    Edit the Active Locks table, commit and push immediately
git add SYNC.md
git commit -m "chore(sync): claim lock on shared-types for TASK-NNN"
git push origin main
```

**After merging your shared resource change:**
```bash
# 3. Update SYNC.md: bump version table, add recent changes row, release lock
git add SYNC.md
git commit -m "chore(sync): release lock, bump {{NPM_SCOPE}}/shared-types to X.Y.Z"
git push origin main
```

### Pull Frequency Rule

Every agent must pull the orchestrator repo at these moments:
- Session start (mandatory)
- After completing each acceptance criteria checkbox
- Before opening a PR
- Whenever you see an unexpected type error that might be a stale contract

### Never Build Stale

If you see a type error for something that should exist in `{{NPM_SCOPE}}/shared-types`,
**do not** add the type locally. Pull orchestrator and shared-types first.
The type may have been added by another agent already.

### Blocked? Log It

If you cannot proceed because you need another agent's output:
1. Add a row to the Cross-Agent Blockers table in `SYNC.md`
2. Switch to a different non-blocked task if possible
3. Do not invent types or contracts to unblock yourself
