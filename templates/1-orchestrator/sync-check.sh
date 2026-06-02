#!/usr/bin/env bash
# sync-check.sh
# Finds the orchestrator repo by walking up the directory tree until it finds
# platform-workspace.json, then checks/pulls SYNC.md.
#
# Any agent can call this from anywhere inside the workspace:
#   bash ../orchestrator/sync-check.sh
#
# Usage:
#   sync-check.sh           — pull and print sync state
#   sync-check.sh --version — check if shared-types needs updating
#   sync-check.sh --lock "resource" "TASK-NNN"  — claim a lock
#   sync-check.sh --unlock "resource"           — release a lock

set -e

# -- Find workspace root ----------------------------------------------------
find_workspace_root() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -f "$dir/platform-workspace.json" ]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo ""
}

WORKSPACE_ROOT=$(find_workspace_root)

if [ -z "$WORKSPACE_ROOT" ]; then
  echo "Could not find platform-workspace.json"
  echo "  Make sure you are inside the workspace and that clone-workspace.sh has run"
  exit 1
fi

ORCH_DIR="$WORKSPACE_ROOT/orchestrator"
SYNC_FILE="$ORCH_DIR/SYNC.md"

# -- Pull latest orchestrator ------------------------------------------------
echo "-> Pulling orchestrator..."
cd "$ORCH_DIR"
git pull origin main --quiet 2>/dev/null && echo "  OK — up to date" || echo "  Warning: could not pull (offline?)"
cd - > /dev/null

# -- Handle flags ------------------------------------------------------------
case "${1:-}" in

  --version)
    echo ""
    echo "Shared dependency versions:"
    grep -A 10 "## Shared Dependency Versions" "$SYNC_FILE" | grep "^\|" | grep -v "Package\|---"
    exit 0
    ;;

  --lock)
    RESOURCE="${2:?Usage: sync-check.sh --lock <resource> <task>}"
    TASK="${3:?Usage: sync-check.sh --lock <resource> <task>}"
    DATE=$(date +%Y-%m-%d)
    AGENT=$(basename "$PWD")
    sed -i "s/| \*(none)\* | .* | — |/| $RESOURCE | $AGENT | $TASK | $DATE | active |/" "$SYNC_FILE"
    cd "$ORCH_DIR"
    git add SYNC.md
    git commit -m "chore(sync): claim lock on $RESOURCE for $TASK"
    git push origin main
    echo "Lock claimed on: $RESOURCE"
    exit 0
    ;;

  --unlock)
    RESOURCE="${2:?Usage: sync-check.sh --unlock <resource>}"
    cd "$ORCH_DIR"
    sed -i "s/| $RESOURCE | .* | active |/| *(none)* | — | — | — | — |/" "$SYNC_FILE"
    git add SYNC.md
    git commit -m "chore(sync): release lock on $RESOURCE"
    git push origin main
    echo "Lock released on: $RESOURCE"
    exit 0
    ;;

esac

# -- Default: show sync state -----------------------------------------------
echo ""
echo "=== SYNC STATE ==="
echo ""

echo "Shared dependency versions:"
awk '/^## Shared Dependency Versions/,/^---$/' "$SYNC_FILE" | grep '^|' | grep -v "Package\|---" || echo "  (none recorded)"
echo ""

LOCKS=$(awk '/^## Active Locks/,/^---$/' "$SYNC_FILE" | grep '^|' | grep -v "Resource\|---" | grep -v "none" || true)
if [ -n "$LOCKS" ]; then
  echo "!! ACTIVE LOCKS:"
  echo "$LOCKS"
  echo ""
fi

echo "Recent shared changes:"
awk '/^## Recent Shared Changes/,/^---$/' "$SYNC_FILE" | grep '^|' | grep -v "Date\|---" | head -5 || echo "  (none)"
echo ""

BLOCKERS=$(awk '/^## Cross-Agent Blockers/,/^---$/' "$SYNC_FILE" | grep '^|' | grep -v "Blocked\|---" | grep -v "none" || true)
if [ -n "$BLOCKERS" ]; then
  echo "!! CROSS-AGENT BLOCKERS:"
  echo "$BLOCKERS"
  echo ""
fi

echo "=== END SYNC STATE ==="
