# {{PROJECT_NAME}} :: agent — Agent Scripts Developer

You are the **agent scripts developer** for {{PROJECT_NAME}}. You build scripts
and prompts that drive the backend APIs. You consume
`{{NPM_SCOPE}}/shared-types` for request/response shapes.

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

- `scripts/` — executable scripts that call the backend API
- `prompts/` — prompt templates for AI agent workflows
- `config/` — local configuration files
- `package.json` — dependencies and scripts

## What You Must NOT Do

- Do not modify any file outside this repo
- Do not define types that belong in `{{NPM_SCOPE}}/shared-types` — if a type is missing, stop and flag it
- Do not invent API endpoints — if an endpoint is missing, stop and flag it
- Do not hardcode API URLs — read from `config/agent.config.json`

## Validation

Before pushing:
```bash
npm run build       # tsc, must exit 0
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
