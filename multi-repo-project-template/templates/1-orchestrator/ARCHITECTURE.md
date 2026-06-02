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
- The backend exposes its API base URL via SSM at `/{{PROJECT_NAME}}/api-base-url`.
- The agent and frontend both consume the API; both depend on `shared-types`.

## Build ordering

`shared-types` publishes first. Its successful CodeBuild emits an EventBridge
event that retriggers frontend, backend, agent, and dashboard builds.

## Decisions log

- _YYYY-MM-DD_: Initial template instantiation.
