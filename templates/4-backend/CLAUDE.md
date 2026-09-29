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
- Do not create resources outside this module's one CloudFormation stack (`{{PROJECT_NAME}}-backend` in the default environment, `{{PROJECT_NAME}}-backend-<env>` in others — always `$CODERA_STACK_NAME`), and do not add a second stack

## Validation

Before pushing:
```bash
npm run build       # tsc, must exit 0
npx tsc --noEmit    # must exit 0
npm test            # must pass (stack + resource naming per environment)
npx cdk synth       # must synthesize without errors
```

## Resource naming (environments share an AWS account)

Several Codera environments of this project can deploy into the SAME AWS
account, so `codera-module.yaml` declares `build.env_namespaced: true`. That
promise holds only while these rules do:

- **One stack, named by the platform.** `bin/backend.ts` defines exactly one
  stack whose construct id and CloudFormation `stackName` are
  `$CODERA_STACK_NAME` (`{{PROJECT_NAME}}-backend` in the default env,
  `{{PROJECT_NAME}}-backend-<env>` in others). No second stack, no
  cross-stack dependencies: the build deploys only that stack
  (`--exclusively`), and a non-default build whose stack does not exist
  afterwards is marked `deploy_failed`.
- **Deploy command.** `build.command` must keep exactly
  `npx cdk deploy "$CODERA_STACK_NAME" --exclusively --require-approval never`.
  Outside the default env the platform refuses anything else (`--all`,
  `--context`, a second stack, a missing `--exclusively`, `cdk bootstrap` /
  `destroy`, a second deploy).
- **Every explicitly named resource** (any `*Name` physical-name property:
  `restApiName`, SSM `parameterName`, `tableName`, `queueName`,
  `functionName`, `roleName`, log groups, alarms, topics, rules, …) is built
  from `prefix` in `lib/backend-stack.ts`:
  - default env → `{{PROJECT_NAME}}` (unchanged — never rename an existing
    resource; a new physical name REPLACES it)
  - other envs → `{{PROJECT_NAME}}-<env>`
  Prefer leaving resources unnamed (CloudFormation derives a unique name from
  the stack) over naming them. The table and queue are unnamed on purpose.
- **Runtime lookups** of named resources use the `RESOURCE_PREFIX` Lambda env
  var — never recompute the prefix or hard-code `{{PROJECT_NAME}}` in handler
  code.
- **Name length.** The project name is at most 21 characters and an
  environment slug at most 30, so the longest prefix is 52 characters. Check
  the limit of any new named resource type against that (e.g. an IAM role
  name allows only 64) — prefer leaving it unnamed.
- `npm test` runs the real app for the default env and a non-default env and
  checks the stack name, that there is one stack with no dependencies, and
  every named resource. Add any new named resource to `EXPECTED` in
  `test/resource-names.test.ts`.

If you add a named resource that cannot follow the prefix rule, set
`env_namespaced` to `false` — the platform then refuses to put a second
environment in this account instead of letting the stacks collide.

## Deploying

CodeBuild runs `npx cdk deploy "$CODERA_STACK_NAME" --exclusively --require-approval never`
automatically when you push to `main`.

The frontend and dashboard get the API URL from this stack's `ApiUrl`
CloudFormation output: Codera copies it into their `/config.json` as
`backend.RestApiUrl`, per environment (template `config_from`). Do not rename
`ApiUrl` or move it into a nested construct (that changes its output name) —
`npm test` checks it. The URL is also written to SSM at
`/{{PROJECT_NAME}}/api-base-url` in the default environment
(`/{{PROJECT_NAME}}-<env>/api-base-url` in others) for scripts; Codera-hosted
frontends do not read it.

## After Completing a Task

1. Validate the build and synth pass
2. Commit, push to `main`
3. Update the task file status: `**Status:** Complete — pushed to main`
4. Commit and push the orchestrator task file update

## Conventions

- Cross-repo data shapes come from `{{NPM_SCOPE}}/shared-types` — never redefine them here.
- Authenticate npm to CodeArtifact before installing: `aws codeartifact login --tool npm --domain {{CODEARTIFACT_DOMAIN}} --domain-owner {{AWS_ACCOUNT_ID}} --repository {{CODEARTIFACT_REPO}} --region {{AWS_REGION}}`.
