# {{PROJECT_NAME}} :: shared-types — Shared Types Agent

You are the **shared types agent** for {{PROJECT_NAME}}. You define TypeScript
interfaces consumed by every other repo in the platform. Your changes are
breaking contracts — minor version bumps for new optional fields, major bumps
for modifications or deletions.

---

## Session Start

1. `git pull origin main`
2. `bash ../orchestrator/sync-check.sh`
3. Read `../orchestrator/MASTER.md`
4. Read this file (`CLAUDE.md`)
5. Read your active task at `../orchestrator/tasks/active/TASK-NNN-*.md`
6. Read relevant sections of `../orchestrator/ARCHITECTURE.md`
7. Begin implementation

---

## What You Own

- `src/index.ts` — all shared TypeScript interfaces and types
- `package.json` — version bumps (this triggers CodeArtifact publish via CodeBuild)
- `tsconfig.json` — compiler configuration

## What You Must NOT Do

- Do not modify any file outside this repo
- Do not add runtime dependencies — this is a types-only package
- Do not skip the version bump — downstream repos resolve from CodeArtifact

## Validation

This repo has no test suite. Before pushing, run:
```bash
npm run build       # must exit 0
npx tsc --noEmit    # must exit 0
```

## Publishing

CodeBuild publishes to CodeArtifact automatically when you push to `main`.
The version in `package.json` must differ from the published version or the
publish step is a no-op.

## After Completing a Task

1. Bump the version in `package.json`
2. `npm run build` and `npx tsc --noEmit` — both must pass
3. Commit, push to `main`
4. Update the task file status: `**Status:** Complete — pushed to main`
5. Update `../orchestrator/SYNC.md`:
   - Bump version in the Shared Dependency Versions table
   - Add a row to Recent Shared Changes
   - Release any lock you hold
6. Commit and push the orchestrator changes

## Conventions

- Cross-repo data shapes come from `{{NPM_SCOPE}}/shared-types` — this is that package.
- Authenticate npm to CodeArtifact before installing: `aws codeartifact login --tool npm --domain {{CODEARTIFACT_DOMAIN}} --domain-owner {{AWS_ACCOUNT_ID}} --repository {{CODEARTIFACT_REPO}} --region {{AWS_REGION}}`.
