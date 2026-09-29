# Multi-repo project template (AWS CodeCommit + CodeBuild + CodeArtifact)

A cloneable template that spins up a six-repository project structure, designed
for a Claude Code workflow where each repo has a focused responsibility.

## The six repositories

1. **orchestrator** — docs, architecture, tasks, and generated sub-agent prompts (source of truth).
2. **shared-types** — shared TypeScript types, published to CodeArtifact as a private npm package.
3. **frontend** — React + Tailwind app (CRUD, workflows, reporting).
4. **backend** — CDK infra: DynamoDB, SQS, API Gateway, Lambdas.
5. **agent** — scripts, prompts, and config that drive the backend APIs.
6. **dashboard** — monitoring UI (charts, metrics, notifications).

## How it works

```
codera-multi-repo-project-template/
├── template.json              # Codera platform manifest (source_path references)
├── template.config.json       # placeholders ({{PROJECT_NAME}}, region, scope, ...)
├── new-project.sh             # templates, deploys infra, pushes 6 repos
├── bootstrap/
│   ├── new-project.sh         # same script, resolves paths relative to bootstrap/
│   ├── clone-workspace.sh     # clones all 6 repos side by side for Claude Code
│   ├── teardown.sh            # destroys all AWS resources for a test project
│   └── infra/                 # CDK app: CodeCommit + CodeArtifact + CodeBuild
└── templates/                 # the 6 repo templates with {{PLACEHOLDERS}}
```

`new-project.sh` copies `templates/`, substitutes placeholders, deploys the CDK
`PlatformStack` (creating the 6 CodeCommit repos, a CodeArtifact npm repo with a
public upstream, and one CodeBuild project per repo), then pushes each templated
subdirectory to its repo.

## Shared types via CodeArtifact

`shared-types` publishes `{{NPM_SCOPE}}/shared-types` to CodeArtifact on each
build. Every build (and every developer, locally) runs
`aws codeartifact login --tool npm` before `npm install` / `npm publish`. The
login writes the user-level `~/.npmrc` registry and a 12-hour token for the
account the build runs in, so the scoped package resolves from that account's
repository. The repos deliberately commit no `.npmrc` (and `shared-types` no
`publishConfig.registry`) pinning one account's CodeArtifact host: a pin would
override the login and send builds in any other account (e.g. a bound Codera
environment) to the wrong host, failing with E401. For local dev, run the same
login with your IAM/SSO credentials against the account of the environment you
work on.

Bump the shared-types `version` in `package.json` on every change to what it
ships: CodeArtifact versions are immutable. The publish step
(`templates/2-shared-types/scripts/publish.sh`, called from both `buildspec.yml`
and `codera-module.yaml`) publishes a new version, succeeds as a no-op when the
same version is already published with identical content (a rebuild of the
same commit), and **fails the build** when that version is already published
with different content, or when the registry query or the publish itself fails
(auth, wrong registry). Projects instantiated before template 1.4.0 still run
`npm publish || echo "Version may already exist; skipping publish."`, which
passes the build on every publish failure and silently drops unbumped changes —
copy `templates/2-shared-types/scripts/publish.sh` into the shared-types repo
(as `scripts/publish.sh`) and replace that line with `sh scripts/publish.sh` in
both `buildspec.yml` and `codera-module.yaml` by hand.

## Build ordering

A successful `shared-types` build emits a CodeBuild state-change event; an
EventBridge rule retriggers the four consumer builds so they pick up the new
package version.

## Quick start

```bash
# 1. Edit template.config.json (or pass flags).
# 2. Ensure prerequisites: aws cli v2, node, cdk, git, jq,
#    and git-remote-codecommit (pip install git-remote-codecommit).
# 3. Scaffold:
./bootstrap/new-project.sh --name myproject --region ca-central-1

# 4. Clone everything side by side for Claude Code:
./bootstrap/clone-workspace.sh --name myproject --dest ~/work
```

## Tearing down a test project

```bash
./bootstrap/teardown.sh --name myproject --region ca-central-1
# add --delete-data to also remove the retained DynamoDB table
# add --yes to skip the confirmation prompt
```

It destroys resources in the order CloudFormation needs: the separate
`<project>-backend` CDK stack first (its DynamoDB table is RETAIN by default and
only deleted with `--delete-data`), then the CodeArtifact repos + domain, then
the CodeCommit repos, then the `<project>-platform` stack, then the leftover SSM
parameter. If a delete stalls, it's almost always a retained data store or a
non-empty S3 deploy bucket you created separately — clear it and re-run.

## Notes / things to scope down before production

- The backend CodeBuild role uses broad deploy permissions for convenience.
  Tighten these to least-privilege for real workloads.
- CodeCommit returned to full GA in November 2025. Git LFS and a Calgary
  (ca-west-1) region were on the roadmap for 2026 — verify current availability
  in your region if either matters to you.
- Decide whether CodeArtifact domains are per-project (isolation) or shared
  (less overhead). The template assumes one domain per project.
