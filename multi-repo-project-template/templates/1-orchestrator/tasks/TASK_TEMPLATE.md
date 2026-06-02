# TASK-NNN: [Short Title]

**Repo:** {{PROJECT_NAME}}-[repo-name]
**Status:** Ready
**Priority:** High | Medium | Low
**Depends on:** TASK-NNN (or none)
**Blocks:** TASK-NNN (or none)
**Estimate:** S | M | L (Small = 1-2 hrs, Medium = half day, Large = full day+)

---

## Context

<!-- 2-4 sentences explaining WHY this task exists and what the user/system gets from it.
     Reference the architecture section that motivated this work. -->

See ARCHITECTURE.md section N.N for the full design.

---

## Read Before Starting

In this order:

- [ ] `../orchestrator/MASTER.md`
- [ ] `CLAUDE.md` in your repo
- [ ] `../orchestrator/ARCHITECTURE.md` sections: N, N, N
- [ ] Any other files relevant to the task

---

## Acceptance Criteria

Complete in order. Do not start item N+1 until item N is done and committed.

- [ ] **1. [First deliverable]**
      [One sentence on what done looks like and how to verify it]

- [ ] **2. [Second deliverable]**
      [One sentence on what done looks like and how to verify it]

- [ ] **3. Build passes**
      `npm run build` exits 0 with no failures.

- [ ] **4. No TypeScript errors**
      `npx tsc --noEmit` exits 0

- [ ] **5. Task file updated**
      Status line updated to `Complete — PR #NNN merged`

---

## Files Expected to Change

```
{{PROJECT_NAME}}-[repo]/
  src/
    [path/to/file.ts]      <- [what changes and why]
    [path/to/file.ts]      <- [what changes and why]
```

---

## Do Not Touch

- `../shared-types/src/` — request changes via SYNC.md if needed
- `../orchestrator/ARCHITECTURE.md` — read-only
- Any file outside your assigned repo

---

## Notes for Reviewer

<!-- Optional: anything the PR reviewer should pay particular attention to -->
