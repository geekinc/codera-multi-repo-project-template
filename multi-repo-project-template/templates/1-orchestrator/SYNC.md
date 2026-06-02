# Agent Sync Board — {{PROJECT_NAME}}

> **Every agent reads this file at session start and after every push.**
> **Every agent updates this file when they change a shared dependency.**

This file is the coordination layer between parallel agents.
It prevents agents from building against stale contracts or types.

---

## Shared Dependency Versions

These are the versions agents must use. When an agent bumps one, they update
this table and all other agents must pull the orchestrator and re-run
`npm install` before continuing.

| Package | Current Version | Last Changed | Changed By |
|---|---|---|---|
| `{{NPM_SCOPE}}/shared-types` | 0.2.0 | (initial) | template |

---

## Active Locks

If an agent is actively modifying a shared contract or type, they claim a lock
here to prevent conflicts. Locks are released when the PR is merged to main.

| Resource | Locked By | Task | Since | Status |
|---|---|---|---|---|
| *(none)* | — | — | — | — |

**Lock rules:**
- Claim a lock before making any change to `shared-types/`
- Only one agent may hold a lock on a given resource at a time
- If you need a locked resource, wait and check back — do not work around it
- Release by updating Status to `released` then removing the row on next edit

---

## Recent Shared Changes (Rolling 50 Entries)

Log of changes to shared dependencies. Newest at top.
Other agents use this to know what to pull and reinstall.

| Date | What Changed | Version | Action Required |
|---|---|---|---|

---

## Cross-Agent Blockers

If your task is blocked waiting on another agent's output, log it here.
The blocking agent should check this regularly and notify when unblocked.

| Blocked Task | Blocked Repo | Waiting On | Blocking Task | Notes |
|---|---|---|---|---|
| *(none)* | — | — | — | — |

---

## How to Use This File

### At the start of every session:
```bash
cd ../orchestrator
git pull origin main
cat SYNC.md
```
Check the versions table and recent changes. If `{{NPM_SCOPE}}/shared-types` version
is newer than what you have locally:
```bash
cd ../shared-types && git pull origin main && npm run build
cd ../your-repo && npm install
```

### Before modifying any shared resource:
1. Pull latest orchestrator
2. Check Active Locks — if resource is locked, wait
3. Add your lock to the table
4. Commit and push `SYNC.md` immediately (before doing any other work)
5. Proceed with your changes

### After pushing a change to a shared resource:
1. Update the Versions table (if applicable)
2. Add a row to Recent Shared Changes
3. Remove your lock from Active Locks
4. Commit and push `SYNC.md`

### When your task is blocked:
1. Add a row to Cross-Agent Blockers
2. Move your attention to a different non-blocked task if possible
3. The blocking agent should check this table before ending their session
