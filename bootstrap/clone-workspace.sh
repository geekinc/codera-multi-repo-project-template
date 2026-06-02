#!/usr/bin/env bash
#
# clone-workspace.sh — clone all repos for an existing project into sibling
# directories so you can point Claude Code at the whole set at once.
#
# Layout produced:
#   <workspace>/<project>/orchestrator
#                         /shared-types
#                         /frontend
#                         /backend
#                         /agent
#                         /dashboard
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CONFIG="$ROOT/template.config.json"

PROJECT_NAME=""; AWS_REGION=""; DEST="$PWD"; AWS_PROFILE_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) PROJECT_NAME="$2"; shift 2;;
    --region) AWS_REGION="$2"; shift 2;;
    --dest) DEST="$2"; shift 2;;
    --profile) AWS_PROFILE_ARG="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

# If --profile was given, export it so git-remote-codecommit inherits it.
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  export AWS_PROFILE="$AWS_PROFILE_ARG"
fi
[[ -n "${AWS_PROFILE:-}" ]] && echo ">> Using AWS_PROFILE=$AWS_PROFILE"

cfg() { jq -r ".$1" "$CONFIG"; }
PROJECT_NAME="${PROJECT_NAME:-$(cfg PROJECT_NAME)}"
AWS_REGION="${AWS_REGION:-$(cfg AWS_REGION)}"

ws="$DEST/$PROJECT_NAME"
mkdir -p "$ws"
mapfile -t REPOS < <(jq -r '.REPOS[]' "$CONFIG")
for repo in "${REPOS[@]}"; do
  target="$ws/$repo"
  if [[ -d "$target/.git" ]]; then
    echo ">> $repo already cloned, pulling..."
    git -C "$target" pull -q --ff-only || true
  else
    echo ">> Cloning $PROJECT_NAME-$repo -> $target"
    git clone -q "codecommit::$AWS_REGION://$PROJECT_NAME-$repo" "$target"
  fi
done

# A root CLAUDE.md that orients Claude Code across the whole workspace.
cat > "$ws/CLAUDE.md" <<EOF
# $PROJECT_NAME — workspace root

This directory contains all repositories for **$PROJECT_NAME**. Each subdir is an
independent CodeCommit repo with its own CLAUDE.md describing its focus.

## Repositories

- \`orchestrator/\` — architecture, tasks, coordination. **Start here.** Run the ORCHESTRATOR_PROMPT.md in Claude Code.
- \`shared-types/\` — published to CodeArtifact as \`$(cfg NPM_SCOPE)/shared-types\`. Source of truth for cross-cutting types.
- \`frontend/\`  — React + Vite app. Deployed to CloudFront.
- \`backend/\`   — CDK infra + Lambdas (DynamoDB, SQS, API Gateway).
- \`agent/\`     — scripts, prompts, and local config that drive the backend APIs.
- \`dashboard/\` — monitoring UI (charts, metrics). Deployed to CloudFront.

## How to Work

1. Open Claude Code in \`orchestrator/\` and paste the contents of \`ORCHESTRATOR_PROMPT.md\`
2. Describe the feature you want built
3. The orchestrator decomposes it into tasks and generates sub-agent prompts
4. Open Claude Code in the target repo and paste the generated prompt
5. When the sub-agent finishes, report back to the orchestrator

## Rules

- When changing a shared type, bump and publish \`shared-types\` first, then update consumers.
- Every agent reads \`orchestrator/MASTER.md\` at session start.
- Every agent runs \`bash ../orchestrator/sync-check.sh\` before starting work.
EOF

# platform-workspace.json — marker file so sync-check.sh can find the workspace root.
cat > "$ws/platform-workspace.json" <<EOF
{
  "project": "$PROJECT_NAME",
  "repos": ["orchestrator", "shared-types", "frontend", "backend", "agent", "dashboard"]
}
EOF

# Install pre-push hook in each sub-agent repo (not orchestrator itself).
for repo in shared-types frontend backend agent dashboard; do
  hook_dir="$ws/$repo/.git/hooks"
  if [ -d "$hook_dir" ]; then
    cp "$ws/orchestrator/git-hooks/pre-push" "$hook_dir/pre-push"
    chmod +x "$hook_dir/pre-push"
    echo ">> Installed pre-push hook in $repo"
  fi
done

echo ">> Workspace ready at $ws"
