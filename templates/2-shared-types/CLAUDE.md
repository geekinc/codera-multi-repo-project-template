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
6. Read relevant sections of `../orchestrator/docs/ARCHITECTURE.md`
7. Begin implementation

---

## What You Own

- `src/index.ts` — all shared TypeScript interfaces and types
- `package.json` — version bumps (this triggers CodeArtifact publish via CodeBuild)
- `scripts/publish.sh` — the CodeBuild publish step (fails loudly; see Publishing)
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

CodeBuild publishes to CodeArtifact automatically when you push to `main`,
via `scripts/publish.sh`. **Bump the version in `package.json` on every change
to what the package ships** (`src/`, `package.json`, `tsconfig.json`):
CodeArtifact versions are immutable, so a changed package cannot be
republished under an existing version.

`scripts/publish.sh` enforces this:

- version not yet published → `npm publish`; any publish failure fails the build;
- version already published with **identical** content (a rebuild of the same
  commit, or a change that does not alter the packed files) → succeeds as a no-op;
- version already published with **different** content → the build FAILS with
  `shared-types <version> ... is already published with different content —
  bump the version in package.json`;
- any registry error other than "not found" (expired CodeArtifact login, wrong
  registry, network) → the build FAILS.

Do not wrap the publish step in `|| true` / `|| echo` — that is how changes
used to be dropped silently.

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
- Authenticate npm to CodeArtifact before `npm install`: `aws codeartifact login --tool npm --domain {{CODEARTIFACT_DOMAIN}} --domain-owner <account> --repository {{CODEARTIFACT_REPO}} --region <region>`, where `<account>`/`<region>` are those of the environment you are building against (a bound environment uses its own account). The login sets your user-level npm registry and token; there is deliberately no committed `.npmrc` pinning `{{NPM_SCOPE}}` to one account's CodeArtifact host — do not add one, or builds in other accounts fail with E401. Every build already runs the same login first, with the exact coordinates in `$CA_DOMAIN` / `$CA_DOMAIN_OWNER` / `$CA_REPO`.
