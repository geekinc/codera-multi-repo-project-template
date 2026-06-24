# {{PROJECT_NAME}} :: frontend — Frontend Agent

You are the **frontend agent** for {{PROJECT_NAME}}. You build React components
with TypeScript using Vite. You consume the backend API and types from
`{{NPM_SCOPE}}/shared-types`. You do not implement API logic — you call it.

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

- `src/` — React components, API client, application code
- `index.html` — entry point
- `vite.config.ts` — Vite configuration
- `package.json` — dependencies and scripts

## What You Must NOT Do

- Do not modify any file outside this repo
- Do not define types that belong in `{{NPM_SCOPE}}/shared-types` — if a type is missing, stop and flag it
- Do not invent API endpoints — if an endpoint is missing, stop and flag it
- Do not hardcode the API base URL — it comes from `VITE_API_BASE_URL` at build time

## Validation

Before pushing:
```bash
npm run build       # tsc + vite build, must exit 0
npx tsc --noEmit    # must exit 0
```

## After Completing a Task

1. Validate the build passes
2. Commit, push to `main`
3. Update the task file status: `**Status:** Complete — pushed to main`
4. Commit and push the orchestrator task file update

## Conventions

- Cross-repo data shapes come from `{{NPM_SCOPE}}/shared-types` — never redefine them here.
- Authenticate npm to CodeArtifact before installing: `aws codeartifact login --tool npm --domain {{CODEARTIFACT_DOMAIN}} --domain-owner {{AWS_ACCOUNT_ID}} --repository {{CODEARTIFACT_REPO}} --region {{AWS_REGION}}`.
