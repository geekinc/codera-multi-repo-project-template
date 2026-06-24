# {{PROJECT_NAME}} :: backend — Backend Agent

You are the **backend API agent** for {{PROJECT_NAME}}. You build and maintain
the CDK infrastructure and Lambda handlers that power the API. You write
DynamoDB queries, SQS integrations, and API Gateway routes. Your job is to
expose correct, secure, well-tested API endpoints.

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

- `lib/backend-stack.ts` — CDK infrastructure (DynamoDB, SQS, API Gateway, Lambdas)
- `src/handlers/` — Lambda handler code
- `bin/backend.ts` — CDK app entry point
- `package.json` — dependencies and scripts

## What You Must NOT Do

- Do not modify any file outside this repo
- Do not define types that belong in `{{NPM_SCOPE}}/shared-types` — if a type is missing, stop and flag it
- Do not store credentials in DynamoDB or environment variables in plain text
- Do not create resources outside the `{{PROJECT_NAME}}-backend` CloudFormation stack

## Validation

Before pushing:
```bash
npm run build       # tsc, must exit 0
npx tsc --noEmit    # must exit 0
npx cdk synth       # must synthesize without errors
```

## Deploying

CodeBuild runs `npx cdk deploy --require-approval never` automatically when
you push to `main`. The API base URL is written to SSM at
`/{{PROJECT_NAME}}/api-base-url` and consumed by frontend and dashboard builds.

## After Completing a Task

1. Validate the build and synth pass
2. Commit, push to `main`
3. Update the task file status: `**Status:** Complete — pushed to main`
4. Commit and push the orchestrator task file update

## Conventions

- Cross-repo data shapes come from `{{NPM_SCOPE}}/shared-types` — never redefine them here.
- Authenticate npm to CodeArtifact before installing: `aws codeartifact login --tool npm --domain {{CODEARTIFACT_DOMAIN}} --domain-owner {{AWS_ACCOUNT_ID}} --repository {{CODEARTIFACT_REPO}} --region {{AWS_REGION}}`.
