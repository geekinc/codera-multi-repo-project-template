# {{PROJECT_NAME}} — Architecture Overview

> Canonical, agreed-upon architecture. Changes here are the source of truth and
> should be reflected in sub-agent prompts before work begins in other repos.

## System shape

| Repo | Responsibility | Deploys to |
|------|----------------|------------|
| orchestrator | Docs, architecture, tasks, generated prompts | (docs only) |
| shared-types | Cross-cutting TypeScript types | CodeArtifact ({{NPM_SCOPE}}/shared-types) |
| frontend | React + Tailwind app (CRUD, workflows, reporting) | S3 + CloudFront |
| backend | DynamoDB, SQS, API Gateway, Lambdas (CDK) | CloudFormation |
| agent | Scripts + prompts driving backend APIs | Packaged artifact |
| dashboard | Monitoring UI (charts, metrics, alerts) | S3 + CloudFront |

## Contracts

- All cross-repo data shapes live in `shared-types`. Never duplicate a type.
- The backend exposes its API base URL as the `ApiUrl` output of its stack.
  Codera copies it into the frontend's and dashboard's `/config.json` as
  `backend.RestApiUrl` for each environment, and both apps read it at runtime
  (`src/lib/config.ts`) — nothing is baked in at build time. It is also in SSM
  at `/<prefix>/api-base-url` (for scripts and the standalone `bootstrap/`
  pipeline), where `<prefix>` is `{{PROJECT_NAME}}` in the default Codera
  environment and `{{PROJECT_NAME}}-<env>` in any other (e.g.
  `/{{PROJECT_NAME}}-production/api-base-url`).
  Every explicitly named backend resource uses that prefix, and the backend's
  one CDK stack is `{{PROJECT_NAME}}-backend` (`{{PROJECT_NAME}}-backend-<env>`
  elsewhere), so environments can share one AWS account; Lambdas receive the
  prefix as `RESOURCE_PREFIX`. See the backend's `CLAUDE.md` → "Resource naming".
- The agent and frontend both consume the API; both depend on `shared-types`.

## Build ordering

`shared-types` publishes first. Its successful CodeBuild emits an EventBridge
event that retriggers frontend, backend, agent, and dashboard builds.
When Codera creates the project, the frontend and dashboard are created after
the backend has deployed, so their first `/config.json` already carries its
`ApiUrl`.

## Decisions log

- _YYYY-MM-DD_: Initial template instantiation.
