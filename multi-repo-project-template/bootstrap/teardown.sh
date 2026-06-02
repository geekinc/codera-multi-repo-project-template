#!/usr/bin/env bash
#
# teardown.sh — destroy all AWS resources for a test project created by
# new-project.sh. Handles the deletion-order gotchas:
#
#   1. The backend's own CDK stack (<project>-backend) is separate from the
#      platform stack and must be destroyed first. Its DynamoDB table is
#      RETAIN by default, so it survives unless you pass --delete-data.
#   2. CodeArtifact: package versions / repos must be cleared before the
#      domain can be deleted. We delete the repos explicitly, then the domain.
#   3. CodeCommit repos delete fine even when non-empty, but we do it
#      explicitly so a failed platform-stack delete doesn't strand them.
#   4. Finally the platform CloudFormation stack (<project>-platform).
#
# This is destructive and irreversible. Use only on throwaway/test projects.
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
CONFIG="$ROOT/template.config.json"

PROJECT_NAME=""; AWS_REGION=""; DELETE_DATA="false"; ASSUME_YES="false"; AWS_PROFILE_ARG=""
usage() {
  cat <<EOF
Usage: $0 [--name NAME] [--region REGION] [--profile PROFILE] [--delete-data] [--yes]

  --profile       Sets AWS_PROFILE for all aws calls; if omitted, the existing
                  AWS_PROFILE environment variable (if any) is used.
  --delete-data   Also delete retained data stores (e.g. the DynamoDB table).
                  Without this, RETAIN'd resources are left in place.
  --yes           Skip the confirmation prompt.

Defaults for name/region come from template.config.json.
EOF
  exit 1
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) PROJECT_NAME="$2"; shift 2;;
    --region) AWS_REGION="$2"; shift 2;;
    --profile) AWS_PROFILE_ARG="$2"; shift 2;;
    --delete-data) DELETE_DATA="true"; shift;;
    --yes) ASSUME_YES="true"; shift;;
    -h|--help) usage;;
    *) echo "Unknown arg: $1"; usage;;
  esac
done

# If --profile was given, export it so every aws call inherits it.
if [[ -n "$AWS_PROFILE_ARG" ]]; then
  export AWS_PROFILE="$AWS_PROFILE_ARG"
fi
[[ -n "${AWS_PROFILE:-}" ]] && echo ">> Using AWS_PROFILE=$AWS_PROFILE"

command -v jq >/dev/null || { echo "jq is required"; exit 1; }
cfg() { jq -r ".$1" "$CONFIG"; }
PROJECT_NAME="${PROJECT_NAME:-$(cfg PROJECT_NAME)}"
AWS_REGION="${AWS_REGION:-$(cfg AWS_REGION)}"
CA_DOMAIN="$(cfg CODEARTIFACT_DOMAIN)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

# Helper: does a CloudFormation stack exist?
stack_exists() {
  aws cloudformation describe-stacks --stack-name "$1" --region "$AWS_REGION" >/dev/null 2>&1
}

echo "About to DESTROY all resources for project: $PROJECT_NAME"
echo "  Region:      $AWS_REGION"
echo "  Account:     $ACCOUNT_ID"
echo "  Delete data: $DELETE_DATA"
echo
echo "This will remove CodeCommit repos, CodeBuild projects, the CodeArtifact"
echo "domain/repos, and the backend + platform CloudFormation stacks."
if [[ "$ASSUME_YES" != "true" ]]; then
  read -r -p "Type the project name to confirm: " CONFIRM
  [[ "$CONFIRM" == "$PROJECT_NAME" ]] || { echo "Mismatch, aborting."; exit 1; }
fi

# --- 1. backend CDK stack ----------------------------------------------
BACKEND_STACK="$PROJECT_NAME-backend"
if stack_exists "$BACKEND_STACK"; then
  echo ">> Destroying backend stack: $BACKEND_STACK"
  if [[ "$DELETE_DATA" == "true" ]]; then
    # Flip retained data stores to DELETE before tearing down. We update the
    # retain policy on any DynamoDB tables owned by this stack, then delete.
    echo "   Clearing retention on DynamoDB tables in the stack..."
    TABLES=$(aws cloudformation list-stack-resources --stack-name "$BACKEND_STACK" \
      --region "$AWS_REGION" \
      --query "StackResourceSummaries[?ResourceType=='AWS::DynamoDB::Table'].PhysicalResourceId" \
      --output text || true)
    for t in $TABLES; do
      echo "   Deleting table $t"
      aws dynamodb delete-table --table-name "$t" --region "$AWS_REGION" >/dev/null 2>&1 || true
    done
  else
    echo "   (Retained resources like the DynamoDB table will be left in place.)"
  fi
  aws cloudformation delete-stack --stack-name "$BACKEND_STACK" --region "$AWS_REGION"
  echo "   Waiting for $BACKEND_STACK deletion..."
  aws cloudformation wait stack-delete-complete --stack-name "$BACKEND_STACK" --region "$AWS_REGION" || \
    echo "   !! Backend stack delete did not complete cleanly. Check the console; retained resources can block it."
else
  echo ">> No backend stack ($BACKEND_STACK) found, skipping."
fi

# --- 2. CodeArtifact: repos then domain --------------------------------
# Deleting the domain requires its repositories be gone first.
if aws codeartifact describe-domain --domain "$CA_DOMAIN" --region "$AWS_REGION" >/dev/null 2>&1; then
  echo ">> Clearing CodeArtifact domain: $CA_DOMAIN"
  REPOS=$(aws codeartifact list-repositories-in-domain --domain "$CA_DOMAIN" \
    --region "$AWS_REGION" --query "repositories[].name" --output text || true)
  for r in $REPOS; do
    echo "   Deleting CodeArtifact repo: $r"
    aws codeartifact delete-repository --domain "$CA_DOMAIN" --repository "$r" \
      --region "$AWS_REGION" >/dev/null 2>&1 || true
  done
  echo "   Deleting CodeArtifact domain: $CA_DOMAIN"
  aws codeartifact delete-domain --domain "$CA_DOMAIN" --region "$AWS_REGION" >/dev/null 2>&1 || \
    echo "   !! Domain delete failed (may still contain repos). Re-run after repos clear."
else
  echo ">> No CodeArtifact domain ($CA_DOMAIN) found, skipping."
fi

# --- 3. CodeCommit repos -----------------------------------------------
mapfile -t REPO_SUFFIXES < <(jq -r '.REPOS[]' "$CONFIG")
for suffix in "${REPO_SUFFIXES[@]}"; do
  name="$PROJECT_NAME-$suffix"
  if aws codecommit get-repository --repository-name "$name" --region "$AWS_REGION" >/dev/null 2>&1; then
    echo ">> Deleting CodeCommit repo: $name"
    aws codecommit delete-repository --repository-name "$name" --region "$AWS_REGION" >/dev/null 2>&1 || true
  fi
done

# --- 4. platform stack -------------------------------------------------
# By now the CA repos/domain and CC repos are gone, so the stack delete won't
# get stuck on them. CodeBuild projects + IAM roles go with the stack.
PLATFORM_STACK="$PROJECT_NAME-platform"
if stack_exists "$PLATFORM_STACK"; then
  echo ">> Destroying platform stack: $PLATFORM_STACK"
  aws cloudformation delete-stack --stack-name "$PLATFORM_STACK" --region "$AWS_REGION"
  echo "   Waiting for $PLATFORM_STACK deletion..."
  aws cloudformation wait stack-delete-complete --stack-name "$PLATFORM_STACK" --region "$AWS_REGION" || \
    echo "   !! Platform stack delete did not complete. Check the console for the blocking resource."
else
  echo ">> No platform stack ($PLATFORM_STACK) found, skipping."
fi

# --- 5. leftover SSM param (created by backend stack outside retention) -
aws ssm delete-parameter --name "/$PROJECT_NAME/api-base-url" --region "$AWS_REGION" >/dev/null 2>&1 || true

echo ">> Teardown complete for $PROJECT_NAME."
echo "   If anything failed, the usual cause is a retained resource (DynamoDB"
echo "   table, non-empty S3 bucket). Pass --delete-data and re-run, or remove"
echo "   the resource manually, then re-run this script."
