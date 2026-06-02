# Getting Started — Creating a New Project from the Template

This guide walks through every step to scaffold a new multi-repo project using
this template, from installing prerequisites to local development and teardown.

It assumes you've unpacked the template and are working from the
`project-template/` directory.

> **Using a named AWS profile:** if you have multiple profiles configured, you
> have two interchangeable options. Either set `AWS_PROFILE` once in your shell so
> every command inherits it:
>
> ```bash
> export AWS_PROFILE=<profile>      # or your SSO profile name
> ```
>
> …or pass `--profile <profile>` explicitly. The AWS CLI and CDK accept
> `--profile` directly, and the three bootstrap scripts (`new-project.sh`,
> `clone-workspace.sh`, `teardown.sh`) also accept `--profile`, which they export
> internally so their `aws`/`cdk`/`git` calls all use it. If you pass `--profile`
> to a script, you don't also need it exported. Replace `<profile>` throughout
> with your profile name.

---

## Overview

The template provisions a six-repository project on AWS:

| Repo | Responsibility | Deploys to |
|------|----------------|------------|
| `orchestrator` | Docs, architecture, tasks, generated sub-agent prompts (source of truth) | docs only |
| `shared-types` | Shared TypeScript types | CodeArtifact (`@<scope>/shared-types`) |
| `frontend` | React + Tailwind app (CRUD, workflows, reporting) | S3 + CloudFront |
| `backend` | CDK infra: DynamoDB, SQS, API Gateway, Lambdas | CloudFormation |
| `agent` | Scripts + prompts driving the backend APIs | Packaged artifact |
| `dashboard` | Monitoring UI (charts, metrics, notifications) | S3 + CloudFront |

The flow is: configure → deploy infrastructure → push code → clone for local
work → publish `shared-types` → develop.

---

## Step 0 — One-time prerequisites

Install the required tooling and confirm each is on your `PATH`:

```bash
aws --version        # aws-cli v2
node --version       # v20+
npx cdk --version    # CDK v2 (npx fetches it if absent)
jq --version
git --version
```

### Installing `git-remote-codecommit`

This provides the `codecommit://` remote helper that the scripts use to push and
clone. On modern Debian/Ubuntu and Homebrew Python, a plain `pip install` fails
with an `externally-managed-environment` error (PEP 668). Use `pipx`, which
installs it into an isolated environment and still puts the command on your path:

```bash
# Debian/Ubuntu
sudo apt install pipx
pipx ensurepath
pipx install git-remote-codecommit

# macOS (Homebrew)
brew install pipx
pipx ensurepath
pipx install git-remote-codecommit
```

Open a new shell so the updated `PATH` takes effect, then verify:

```bash
git remote-codecommit 2>&1 | head -1   # should run, not "command not found"
```

> **Alternatives if you don't use pipx:**
> - Dedicated venv: `python3 -m venv ~/.venvs/codecommit && ~/.venvs/codecommit/bin/pip install git-remote-codecommit`, then symlink the helper onto your PATH: `ln -s ~/.venvs/codecommit/bin/git-remote-codecommit ~/.local/bin/`
> - User install: `pip install --user git-remote-codecommit`
> - Escape hatch (dev machines only): `pip install --break-system-packages git-remote-codecommit`
>
> If you use a plain venv, the helper must be on `PATH` at the moment `git push`/`clone`
> runs inside the scripts — so activate the venv in the same shell or symlink it as above.
> `pipx` handles this PATH wiring for you.

### AWS credentials and CDK bootstrap

Configure credentials for the target account, then export the profile for the
session and confirm it resolves to the right account:

```bash
aws configure sso             # or: aws configure (for a static-key profile)
export AWS_PROFILE=<profile>
aws sts get-caller-identity --profile <profile>   # confirm the correct account
```

Bootstrap CDK once per account/region (creates the CDK deploy bucket and roles):

```bash
npx cdk bootstrap aws://<ACCOUNT_ID>/ca-central-1 --profile <profile>
```

---

## Step 1 — Configure the project

Edit `template.config.json`. At minimum set `PROJECT_NAME`, `AWS_REGION`, and
`NPM_SCOPE`. You can leave `AWS_ACCOUNT_ID` as the `000000000000` placeholder —
the script auto-resolves it from `aws sts get-caller-identity` (using your
exported `AWS_PROFILE`).

```json
{
  "PROJECT_NAME": "testproj",
  "AWS_REGION": "ca-central-1",
  "NPM_SCOPE": "@testproj",
  "CODEARTIFACT_DOMAIN": "testproj",
  "CODEARTIFACT_REPO": "shared",
  "NODE_VERSION": "20"
}
```

> Keep names lowercase and hyphen-free where possible — they become CodeCommit
> repo names (e.g. `testproj-frontend`) and an npm scope.

---

## Step 2 — Dry run the infrastructure

Validate that the CDK stack synthesizes against your real account **before**
touching CodeCommit. This catches credential, region, and bootstrap problems early:

```bash
cd bootstrap/infra
npm install
npx cdk synth \
  --profile <profile> \
  --context projectName=testproj \
  --context region=ca-central-1 \
  --context caDomain=testproj \
  --context caRepo=shared \
  --context nodeVersion=20
cd ../..
```

If it prints CloudFormation without erroring, you're good.

---

## Step 3 — Deploy infrastructure only

Run the bootstrap with `--skip-push` so it creates AWS resources but doesn't yet
push code. This lets you inspect what was created before committing anything:

```bash
./bootstrap/new-project.sh --name testproj --region ca-central-1 --profile <profile> --skip-push
```

This deploys the six CodeCommit repos, the CodeArtifact domain and repos, and the
six CodeBuild projects. Note the clone URLs printed in the stack outputs.

Verify:

```bash
aws codecommit list-repositories --region ca-central-1 --profile <profile>
aws codeartifact list-repositories-in-domain --domain testproj --region ca-central-1 --profile <profile>
```

---

## Step 4 — Push the templated code

Run again without the skip flag. Since infrastructure already exists, CDK reports
"no changes" and the script substitutes placeholders and pushes each subdirectory
to its matching CodeCommit repo on `main`:

```bash
./bootstrap/new-project.sh --name testproj --region ca-central-1 --profile <profile>
```

> The `git-remote-codecommit` helper authenticates using the profile the script
> exports. If a push fails with an auth error, confirm the profile points at the
> right account with `aws sts get-caller-identity --profile <profile>`.

---

## Step 5 — Clone the workspace for Claude Code

Pull all six repos side by side into one working directory:

```bash
./bootstrap/clone-workspace.sh --name testproj --dest ~/work --profile <profile>
```

You'll get `~/work/testproj/{orchestrator,shared-types,frontend,backend,agent,dashboard}`
plus a root `CLAUDE.md`. Point Claude Code at `~/work/testproj`; each repo's own
`CLAUDE.md` orients it to that repo's focus.

---

## Step 6 — Publish `shared-types` first

Dependency order matters: nothing else installs cleanly until `shared-types` has
published once. Trigger its build:

```bash
aws codebuild start-build --project-name testproj-shared-types --region ca-central-1 --profile <profile>
```

When it succeeds, an EventBridge rule auto-triggers the four consumer builds.
Monitor builds in the CodeBuild console or via:

```bash
aws codebuild list-builds-for-project --project-name testproj-shared-types --region ca-central-1 --profile <profile>
```

---

## Step 7 — Develop locally

In any consumer repo, authenticate npm to CodeArtifact, then install — the local
equivalent of what each `buildspec.yml` does in CI:

```bash
cd ~/work/testproj/frontend
aws codeartifact login --tool npm \
  --domain testproj --domain-owner <ACCOUNT_ID> \
  --repository shared --region ca-central-1 --profile <profile>
npm install
```

The token lasts up to 12 hours; re-run the login when it expires. From here, a
normal `git push` to any repo triggers its CodeBuild.

### Working with shared types

When you change a cross-repo type:

1. Edit and bump the version in `shared-types`.
2. Push (or run its build) to publish the new version to CodeArtifact.
3. Bump the dependency in the consuming repos and reinstall.

Never redefine a shared shape inside a consumer — the `shared-types` package is
the single source of truth.

### Orchestrator workflow

1. Capture or adjust the design in `orchestrator/architecture/overview.md`.
2. Write a task file in `orchestrator/tasks/`.
3. Generate a sub-agent prompt:
   `node prompts/gen-prompt.mjs tasks/T-XXXX.md > prompts/T-XXXX.prompt.md`
4. Hand that prompt to Claude Code in the relevant repo.

---

## Step 8 — Tearing down a test project

Destructive and irreversible — use only on throwaway projects:

```bash
./bootstrap/teardown.sh --name testproj --region ca-central-1 --profile <profile>
# add --delete-data to also remove the retained DynamoDB table
# add --yes to skip the confirmation prompt
```

It deletes in the order AWS requires: the separate `<project>-backend` CDK stack,
then CodeArtifact repos and domain, then CodeCommit repos, then the
`<project>-platform` stack, then the leftover SSM parameter.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `externally-managed-environment` on pip install | PEP 668 on system Python | Use `pipx install git-remote-codecommit` (see Step 0) |
| Commands hit the wrong AWS account | Wrong/unset profile | `export AWS_PROFILE=<profile>`; verify with `aws sts get-caller-identity --profile <profile>` |
| `git push`/`clone` fails with auth/credential error | Wrong/unset profile for the script | Pass `--profile <profile>` to the script (or export `AWS_PROFILE`); confirm the identity resolves |
| CDK deploy fails immediately | CDK not bootstrapped in the region | `npx cdk bootstrap aws://<ACCOUNT_ID>/<region> --profile <profile>` |
| Backend build fails on `cdk deploy` | Region not bootstrapped for the backend stack | Bootstrap the region (Step 0) |
| `npm install` can't find `@scope/shared-types` | `shared-types` hasn't published, or no CodeArtifact login | Run Step 6, then `aws codeartifact login` (Step 7) |
| Frontend/dashboard build succeeds but deploys nothing | `DEPLOY_BUCKET` env var is empty by default | Set `DEPLOY_BUCKET` (and `CLOUDFRONT_DISTRIBUTION_ID`) as a CodeBuild env override |
| `aws codeartifact login` token rejected | Token expired (12h max) | Re-run the login command |
| Teardown stalls on stack delete | A retained data store or non-empty S3 bucket is blocking it | Pass `--delete-data`, or clear the resource manually, then re-run |

---

## Quick reference

```bash
# Either export the profile once...
export AWS_PROFILE=<profile>
# ...or pass --profile to each command/script below.

# Scaffold a new project end to end
./bootstrap/new-project.sh --name <name> --region <region> --profile <profile>

# Clone all repos side by side
./bootstrap/clone-workspace.sh --name <name> --dest <dir> --profile <profile>

# Publish shared types (do this first)
aws codebuild start-build --project-name <name>-shared-types --region <region> --profile <profile>

# Authenticate npm locally before installing in a consumer repo
aws codeartifact login --tool npm --domain <domain> \
  --domain-owner <ACCOUNT_ID> --repository <repo> --region <region> --profile <profile>

# Tear down a test project
./bootstrap/teardown.sh --name <name> --region <region> --profile <profile> [--delete-data] [--yes]
```
