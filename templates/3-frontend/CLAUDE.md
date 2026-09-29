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
- Do not hardcode the API base URL — it comes from `/config.json` at runtime via `src/lib/config.ts` (see "API base URL" below)

## Validation

Before pushing:
```bash
npm run build       # tsc + vite build, must exit 0
npx tsc --noEmit    # must exit 0
npm test            # node:test (Node >= 22.6), must exit 0
```

## API base URL

The app reads the backend URL at runtime, not at build time:

- `src/main.tsx` awaits `loadConfig()` (fetches `/config.json`) before it
  renders anything that calls the API. Keep that ordering: `apiBaseUrl()` /
  `getConfig()` throw if called before the config has loaded.
- On Codera, `/config.json` is written per environment by the platform:
  `backend.RestApiUrl` is the backend stack's `ApiUrl` output for THAT
  environment (template `config_from`). One build serves every environment.
- Local dev (`npm run dev`): `public/config.json` has an empty `backend`, so
  `apiBaseUrl()` falls back to `VITE_API_BASE_URL` — put
  `VITE_API_BASE_URL=https://<api-id>.execute-api.<region>.amazonaws.com/prod`
  in `.env` (git-ignored), or leave it unset to call same-origin relative
  paths. `VITE_API_BASE_URL` is only a fallback: a non-empty
  `backend.RestApiUrl` in `/config.json` always wins.
- Build every request URL as `${apiBaseUrl()}/path` (it has no trailing slash).

## After Completing a Task

1. Validate the build passes
2. Commit, push to `main`
3. Update the task file status: `**Status:** Complete — pushed to main`
4. Commit and push the orchestrator task file update

## Conventions

- Cross-repo data shapes come from `{{NPM_SCOPE}}/shared-types` — never redefine them here.
- Authenticate npm to CodeArtifact before `npm install`: `aws codeartifact login --tool npm --domain {{CODEARTIFACT_DOMAIN}} --domain-owner <account> --repository {{CODEARTIFACT_REPO}} --region <region>`, where `<account>`/`<region>` are those of the environment you are building against (a bound environment uses its own account). The login sets your user-level npm registry and token; there is deliberately no committed `.npmrc` pinning `{{NPM_SCOPE}}` to one account's CodeArtifact host — do not add one, or builds in other accounts fail with E401. Every build already runs the same login first, with the exact coordinates in `$CA_DOMAIN` / `$CA_DOMAIN_OWNER` / `$CA_REPO`.
