#!/usr/bin/env bash
#
# package-zip.sh — build the Codera upload zip for this template.
#
#   scripts/package-zip.sh
#   → dist-zip/codera-multi-repo-project-template-<version>.zip
#
# Ported from codera-multi-repo-sam-project-template f774359
# (SEC-049h-multi-repo-project), itself from codera-multi-repo-auth-template /
# codera-ai-docgen-template / codera-business-website-template (TASK-2272).
# The zip is built with
# `git archive HEAD`, so it holds exactly the COMMITTED
# files (uncommitted changes are left out — commit first) and template.json
# sits at the zip root. <version> is template.json "version" at HEAD.
#
# The script prints the zip's contents and fails (deleting the zip) if:
#   - any build output got into it: node_modules, dist, cdk.out, .aws-sam,
#     .git or *.tsbuildinfo;
#   - template.json is not at the root;
#   - a repository's `source_path` is missing, or an auto-built module's
#     codera-module.yaml / a frontend repo's codera-frontend.yaml is missing
#     (the `agent` module is auto_build: false and has no codera-module.yaml).
# dist-zip/ is gitignored.
#
# Requirements: git, python3 (reads template.json and lists the zip).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

git rev-parse --verify -q HEAD >/dev/null || { echo "!! no commits — nothing to package"; exit 1; }

VERSION="$(git show HEAD:template.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]] || { echo "!! template.json version '$VERSION' is not semver"; exit 1; }

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "!! warning: uncommitted changes are NOT in the zip (it is built from HEAD)"
fi

OUT_DIR="$ROOT/dist-zip"
OUT="$OUT_DIR/codera-multi-repo-project-template-$VERSION.zip"
mkdir -p "$OUT_DIR"
rm -f "$OUT"
git archive --format=zip -o "$OUT" HEAD

fail() { echo "!! $*"; rm -f "$OUT"; exit 1; }

echo ">> $OUT (version $VERSION, commit $(git rev-parse --short HEAD))"
echo ">> contents:"
LISTING="$(python3 - "$OUT" <<'PY'
import sys, zipfile
for info in zipfile.ZipFile(sys.argv[1]).infolist():
    if not info.is_dir():
        print(f"{info.file_size:>9}  {info.filename}")
PY
)" || fail "cannot read $OUT"
printf '%s\n' "$LISTING"

FILES="$(printf '%s\n' "$LISTING" | sed -E 's/^ *[0-9]+  //')"
FORBIDDEN="$(printf '%s\n' "$FILES" | grep -E '(^|/)(node_modules|dist|cdk\.out|\.aws-sam|\.git)(/|$)|\.tsbuildinfo$' || true)"
if [[ -n "$FORBIDDEN" ]]; then
  echo "!! build output in the zip — refusing:"
  printf '%s\n' "$FORBIDDEN" | sed 's/^/   /'
  fail "zip deleted"
fi
# Here-strings, not `printf | grep -q`: grep -q exits on its first match, and
# under pipefail the writer's SIGPIPE would turn that match into a failure.
grep -qx -- 'template.json' <<<"$FILES" || fail "template.json is not at the zip root"

# Every repository source_path must be in the zip, with its platform manifest.
SOURCES="$(git show HEAD:template.json | python3 -c 'import json,sys; [print(r["type"], str(r.get("auto_build", False)).lower(), r["source_path"]) for r in json.load(sys.stdin)["repositories"]]')"
while read -r type auto path; do
  [[ -n "$path" ]] || continue
  grep -q -- "^${path%/}/" <<<"$FILES" || fail "source_path $path is not in the zip"
  case "$type" in
    module) [[ "$auto" != true ]] || grep -qx -- "${path%/}/codera-module.yaml" <<<"$FILES" || fail "${path%/}/codera-module.yaml is missing" ;;
    frontend) grep -qx -- "${path%/}/codera-frontend.yaml" <<<"$FILES" || fail "${path%/}/codera-frontend.yaml is missing" ;;
  esac
done <<<"$SOURCES"

COUNT="$(printf '%s\n' "$FILES" | grep -c .)"
SIZE="$(wc -c < "$OUT" | tr -d ' ')"
echo ">> OK: $COUNT files, $SIZE bytes, no build output, template.json at the root, every source_path present"
