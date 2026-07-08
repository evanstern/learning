#!/usr/bin/env bash
# teardown.sh — Tear down the stack and remove all local state.
#
# What this removes:
#   - docker-compose services + named volumes (Ollama model cache)
#   - SQLite DB file (stacks.db and WAL/SHM files if present)
#   - dist/ (compiled TypeScript output)
#   - node_modules/ (npm packages)
#
# What it does NOT remove:
#   - corpus/ contents (your source HTML files — you have to re-download those)
#   - .env (your API keys)
#   - Source files (src/)
#
# Usage: ./scripts/teardown.sh [--full]
#   --full  Also remove corpus/ contents and .env (nuclear option)
#
# Run from the build/ directory (or from anywhere — script resolves its own root).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FULL_TEARDOWN=false
if [[ "${1:-}" == "--full" ]]; then
  FULL_TEARDOWN=true
fi

echo "=== the-stacks v2 teardown ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# Step 1: Stop and remove docker compose services + named volumes.
echo "[docker] Stopping services and removing volumes..."
if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" down -v --remove-orphans 2>/dev/null || true
  echo "[docker] Done."
else
  echo "[docker] docker compose not found — skipping."
fi
echo ""

# Step 2: Remove the SQLite DB.
echo "[db] Removing SQLite database..."
rm -f "$PROJECT_ROOT/stacks.db" \
       "$PROJECT_ROOT/stacks.db-shm" \
       "$PROJECT_ROOT/stacks.db-wal"
echo "[db] Done."
echo ""

# Step 3: Remove compiled output.
echo "[build] Removing dist/..."
rm -rf "$PROJECT_ROOT/dist"
echo "[build] Done."
echo ""

# Step 4: Remove node_modules.
echo "[npm] Removing node_modules/..."
rm -rf "$PROJECT_ROOT/node_modules"
echo "[npm] Done."
echo ""

# Optional: full teardown (corpus + .env).
if [ "$FULL_TEARDOWN" = true ]; then
  echo "[corpus] --full: removing corpus/*.html..."
  find "$PROJECT_ROOT/corpus" -name "*.html" -o -name "*.htm" | xargs rm -f 2>/dev/null || true
  echo "[corpus] Done."

  echo "[env] --full: removing .env..."
  rm -f "$PROJECT_ROOT/.env"
  echo "[env] Done."
  echo ""
fi

echo "==========================================="
echo " Teardown complete."
echo "==========================================="
echo ""
echo " To bring the stack back up: ./scripts/bootstrap.sh"
echo ""
