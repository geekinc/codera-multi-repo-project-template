#!/usr/bin/env bash
#
# new-project.sh — scaffold a new multi-repo project from this template.
#
# What it does:
#   1. Reads template.config.json (or flag overrides).
#   2. Copies templates/ into a build dir and substitutes {{PLACEHOLDERS}}.
#   3. Deploys the shared infrastructure (CodeArtifact + CodeCommit repos + CodeBuild)
#      via the CDK app in bootstrap/infra.
#   4. Initialises a git repo per template subdir and pushes it to its CodeCommit repo.
#
# Requirements: aws cli v2, node + npm, cdk (npx cdk works), git, jq, and
# git-remote-codecommit (`pip install git-remote-codecommit`) for the grc:// helper.
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE"
CONFIG="$ROOT/template.config.json"

# --- args ---------------------------------------------------------------
PROJECT_NAME=""; AWS_REGION=""; SKIP_INFRA="false"; SKIP_PUSH="false"; AWS_PROFILE_ARG=""
usage() {
  cat <<EOF
Usage: $0 [--name NAME] [--region REGION] [--profile PROFILE] [--skip-infra] [--skip-push]
Defaults are read from template.config.json.
--profile sets AWS_PROFILE for all aws/cdk/git calls; if omitted, the existing
AWS_PROFILE environment variable (if any) is used.
EOF
  exit 1
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) PROJECT_NAME="$2"; shift 2;;
    --region) AWS_REGION="$2"; shift 2;;
    --profile) AWS_PROFILE_ARG="$2"; shift 2;;
    --skip-infra) SKIP_INFRA="true"; shift;;
    --skip-push) SKIP_PUSH="true"; shift;;
    -h|--help) usage;;
    *) echo "Unknown arg: $1"; usage;;
  esac
done

# If --profile was given, export it so every aws/cdk/git call inherits it.
# Otherwise any existing AWS_PROFILE in the environment is left untouched.
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  export AWS_PROFILE="$AWS_PROFILE_ARG"
fi
[[ -n "${AWS_PROFILE:-}" ]] && echo ">> Using AWS_PROFILE=$AWS_PROFILE"

command -v jq >/dev/null || { echo "jq is required"; exit 1; }

# --- load config --------------------------------------------------------
cfg() { jq -r ".$1" "$CONFIG"; }
PROJECT_NAME="${PROJECT_NAME:-$(cfg PROJECT_NAME)}"
AWS_REGION="${AWS_REGION:-$(cfg AWS_REGION)}"
AWS_ACCOUNT_ID="$(cfg AWS_ACCOUNT_ID)"
CA_DOMAIN="$(cfg CODEARTIFACT_DOMAIN)"
CA_REPO="$(cfg CODEARTIFACT_REPO)"
NPM_SCOPE="$(cfg NPM_SCOPE)"
NODE_VERSION="$(cfg NODE_VERSION)"
PROJECT_DESCRIPTION="$(cfg PROJECT_DESCRIPTION)"
DASHBOARD_AUTH_KEY="$(cfg DASHBOARD_AUTH_KEY 2>/dev/null || echo "")"
[[ "$DASHBOARD_AUTH_KEY" == "null" ]] && DASHBOARD_AUTH_KEY=""

# Resolve the real account id if the config still has the placeholder.
if [[ "$AWS_ACCOUNT_ID" == "000000000000" ]]; then
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
fi

BUILD="$ROOT/.build/$PROJECT_NAME"
echo ">> Project:  $PROJECT_NAME"
echo ">> Region:   $AWS_REGION"
echo ">> Account:  $AWS_ACCOUNT_ID"
echo ">> Build at: $BUILD"

# --- 1 + 2. copy & substitute ------------------------------------------
rm -rf "$BUILD"; mkdir -p "$BUILD"
cp -R "$ROOT/templates/." "$BUILD/"

# Substitute placeholders in every text file. Uses a temp file for portability.
substitute() {
  local f="$1"
  sed -e "s|{{PROJECT_NAME}}|$PROJECT_NAME|g" \
      -e "s|{{PROJECT_DESCRIPTION}}|$PROJECT_DESCRIPTION|g" \
      -e "s|{{AWS_REGION}}|$AWS_REGION|g" \
      -e "s|{{AWS_ACCOUNT_ID}}|$AWS_ACCOUNT_ID|g" \
      -e "s|{{CODEARTIFACT_DOMAIN}}|$CA_DOMAIN|g" \
      -e "s|{{CODEARTIFACT_REPO}}|$CA_REPO|g" \
      -e "s|{{NPM_SCOPE}}|$NPM_SCOPE|g" \
      -e "s|{{NODE_VERSION}}|$NODE_VERSION|g" \
      "$f" > "$f.tmp" && mv "$f.tmp" "$f"
}
export -f substitute
export PROJECT_NAME PROJECT_DESCRIPTION AWS_REGION AWS_ACCOUNT_ID CA_DOMAIN CA_REPO NPM_SCOPE NODE_VERSION
find "$BUILD" -type f \
  \( -name '*.json' -o -name '*.md' -o -name '*.yml' -o -name '*.yaml' \
     -o -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.npmrc' \
     -o -name '.npmrc' -o -name '*.sh' -o -name '*.html' \) \
  -exec bash -c 'substitute "$0"' {} \;
echo ">> Placeholders substituted."

# --- 3. infrastructure --------------------------------------------------
if [[ "$SKIP_INFRA" == "false" ]]; then
  echo ">> Deploying infrastructure (CodeArtifact + CodeCommit + CodeBuild)..."
  pushd "$ROOT/bootstrap/infra" >/dev/null
    npm install --silent
    CDK_CONTEXT_ARGS=(
      --context projectName="$PROJECT_NAME"
      --context region="$AWS_REGION"
      --context caDomain="$CA_DOMAIN"
      --context caRepo="$CA_REPO"
      --context nodeVersion="$NODE_VERSION"
    )
    [[ -n "$DASHBOARD_AUTH_KEY" ]] && CDK_CONTEXT_ARGS+=(--context dashboardAuthKey="$DASHBOARD_AUTH_KEY")
    npx cdk deploy --require-approval never "${CDK_CONTEXT_ARGS[@]}"
  popd >/dev/null
else
  echo ">> Skipping infrastructure (--skip-infra)."
fi

# --- 4. push each subdir to its CodeCommit repo -------------------------
if [[ "$SKIP_PUSH" == "false" ]]; then
  mapfile -t REPOS < <(jq -r '.REPOS[]' "$CONFIG")
  for repo in "${REPOS[@]}"; do
    # template dirs are numbered (1-orchestrator); match the suffix.
    src="$(find "$BUILD" -maxdepth 1 -type d -name "*-$repo")"
    [[ -z "$src" ]] && { echo "!! no template dir for $repo, skipping"; continue; }
    cc_name="$PROJECT_NAME-$repo"
    remote="codecommit::$AWS_REGION://$cc_name"
    echo ">> Pushing $src -> $cc_name"
    pushd "$src" >/dev/null
      git init -q -b main
      git add -A
      git -c user.email=bootstrap@local -c user.name=bootstrap \
          commit -q -m "Initial commit from template for $PROJECT_NAME"
      git remote add origin "$remote"
      git push -q origin main || echo "!! push failed for $cc_name (does the repo exist / are grc creds set?)"
    popd >/dev/null
  done
else
  echo ">> Skipping push (--skip-push)."
fi

echo ">> Done. Next: run 'bootstrap/clone-workspace.sh --name $PROJECT_NAME' to pull all repos side by side."
