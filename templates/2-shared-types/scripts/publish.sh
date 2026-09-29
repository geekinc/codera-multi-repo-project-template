#!/bin/sh
# Publish this package to the registry npm is currently logged in to
# (`aws codeartifact login --tool npm` must have run first).
#
# Registry versions are immutable (CodeArtifact reports a duplicate as E409),
# so this never lets a publish failure pass silently:
#   - version not in the registry        -> npm publish; ANY failure fails the build
#   - version present, identical content -> success, nothing to do (rebuild of the same commit)
#   - version present, different content -> FAIL: bump the version in package.json
#   - registry query fails (auth, wrong registry, network) -> FAIL
#
# "Identical" is decided on the packed files, not on tarball bytes or gitHead:
# CodeBuild builds from a source zip with no .git (so npm records no gitHead),
# and gzip output can differ across npm/Node versions for identical files. The
# fast path compares dist.integrity; on a mismatch the published tarball is
# downloaded and its unpacked contents are compared with `npm pack` of this build.
set -eu

PKG=$(node -p "require('./package.json').name")
VER=$(node -p "require('./package.json').version")
SPEC="$PKG@$VER"
REGISTRY=$(npm config get registry)

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
trap 'exit 130' INT TERM

fail() {
  echo "publish: ERROR: $*" >&2
  exit 1
}

echo "publish: $SPEC -> $REGISTRY"

# 1. Is this version already published? E404 (or an empty answer for an
#    existing package without this version) means "no"; any other error fails.
if npm view "$SPEC" dist.integrity --prefer-online >"$WORK/view.out" 2>"$WORK/view.err"; then
  PUBLISHED=$(cat "$WORK/view.out")
elif grep -q 'code E404' "$WORK/view.err"; then
  PUBLISHED=""
else
  cat "$WORK/view.err" >&2
  fail "could not query $REGISTRY for $SPEC (not a 404) — check the CodeArtifact login and registry"
fi

# 2. Not published yet: publish, and let any failure fail the build.
if [ -z "$PUBLISHED" ]; then
  echo "publish: $SPEC is not in the registry yet — publishing"
  npm publish
  echo "publish: published $SPEC"
  exit 0
fi

# 3. Already published: compare with this build.
npm pack --dry-run --json >"$WORK/pack.json" 2>"$WORK/pack.err" \
  || { cat "$WORK/pack.err" >&2; fail "npm pack --dry-run failed"; }
LOCAL=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))[0].integrity)" "$WORK/pack.json")

if [ "$LOCAL" = "$PUBLISHED" ]; then
  echo "publish: $SPEC is already published, identical (integrity match) — nothing to do"
  exit 0
fi

mkdir -p "$WORK/local" "$WORK/remote"
npm pack --pack-destination "$WORK/local" >/dev/null 2>"$WORK/pack.err" \
  || { cat "$WORK/pack.err" >&2; fail "npm pack failed"; }
(cd "$WORK/remote" && npm pack "$SPEC" --prefer-online >/dev/null 2>"$WORK/fetch.err") \
  || { cat "$WORK/fetch.err" >&2; fail "could not download the published $SPEC tarball"; }
tar -xzf "$WORK"/local/*.tgz -C "$WORK/local"
tar -xzf "$WORK"/remote/*.tgz -C "$WORK/remote"

if diff -r "$WORK/local/package" "$WORK/remote/package" >"$WORK/diff.out" 2>&1; then
  echo "publish: $SPEC is already published, identical (same packed files) — nothing to do"
  exit 0
fi

sed 's#'"$WORK"'/##g' "$WORK/diff.out" | head -n 40 >&2
fail "shared-types $VER ($PKG) is already published with different content — bump the version in package.json"
