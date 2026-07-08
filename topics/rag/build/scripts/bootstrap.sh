#!/usr/bin/env bash
# bootstrap.sh — Bring the the-stacks v2 stack up, pull the embedding model, ingest.
#
# What this does:
#   1. Ensures .env exists, installs npm dependencies.
#   2. Starts docker-compose services. GRADUATED (103): Ollama is now ACTIVE (its
#      'embeddings' profile gate was removed), so a plain `up` starts it.
#   3. Waits for Ollama to answer, then pulls the embedding model (nomic-embed-text).
#   4. Ingests corpus/ (embeds via Ollama) — also creates the sqlite-vec schema.
#   5. Prints next-step instructions.
#
# Usage: ./scripts/bootstrap.sh
# Run from the build/ directory (or from anywhere — script resolves its own root).

set -euo pipefail

# Resolve the project root (the directory containing this script's parent).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== the-stacks v2 bootstrap ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# Step 1: Check for .env; create from example if missing.
if [ ! -f "$PROJECT_ROOT/.env" ]; then
  if [ -f "$PROJECT_ROOT/.env.example" ]; then
    echo "[.env] Creating from .env.example..."
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    echo "[.env] Created. Edit $PROJECT_ROOT/.env to add your ANTHROPIC_API_KEY."
  fi
else
  echo "[.env] Found existing .env."
fi
echo ""

# Step 2: Install npm dependencies.
echo "[npm] Installing dependencies..."
cd "$PROJECT_ROOT"
npm install
echo "[npm] Done."
echo ""

# Step 3: Docker compose up + pull the embedding model.
# GRADUATED (103): Ollama is now ACTIVE — OllamaEmbedder needs it running, and the
# model (nomic-embed-text) must be pulled once before any ingest/query can embed.
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
EMBED_MODEL="nomic-embed-text"
if command -v docker &>/dev/null && docker compose version &>/dev/null 2>&1; then
  echo "[docker] Starting services (Ollama active in 103)..."
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" up -d --remove-orphans
  echo "[docker] Services started."

  # Wait for Ollama's HTTP API to answer before pulling — the container takes a few
  # seconds to be ready, and a pull against a not-yet-listening server just errors.
  echo "[ollama] Waiting for Ollama at $OLLAMA_URL ..."
  for i in $(seq 1 30); do
    if curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
      echo "[ollama] Ready."
      break
    fi
    sleep 2
    if [ "$i" -eq 30 ]; then
      echo "[ollama] WARNING: Ollama did not become ready in time. Pull/ingest may fail."
    fi
  done

  # Pull the embedding model into the running container. Idempotent — a no-op if the
  # model is already present in the persisted ollama_data volume.
  echo "[ollama] Pulling $EMBED_MODEL (first run downloads ~275MB; cached after)..."
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" exec -T ollama ollama pull "$EMBED_MODEL"
  echo "[ollama] Model ready."
else
  # Fallback: no docker. A native `ollama serve` on the host works too (same URL).
  echo "[docker] docker compose not found."
  echo "[ollama] If you have a native Ollama install, ensure it's running and pull the model:"
  echo "         ollama serve   # (in another terminal)"
  echo "         ollama pull $EMBED_MODEL"
  echo "[ollama] OllamaEmbedder will fail loudly at ingest if Ollama isn't reachable at $OLLAMA_URL."
fi
echo ""

# Step 4: Ingest the corpus (also creates the sqlite-vec schema on first run).
# GRADUATED (103): this now embeds real chunks via Ollama. If corpus/ is empty,
# ingestCorpus just creates the schema and exits — drop HTML in and re-run.
echo "[db] Ingesting corpus + initializing sqlite-vec schema (float[768])..."
npx tsx "$PROJECT_ROOT/src/cli.ts" ingest
echo "[db] Done — $PROJECT_ROOT/stacks.db"
echo ""

# Step 5: Print corpus instructions.
echo "==========================================="
echo " Bootstrap complete!"
echo "==========================================="
echo ""
echo " Next step: add D&D Beyond HTML pages to the corpus."
echo ""
echo "   Drop your HTML files here:"
echo "   $PROJECT_ROOT/corpus/"
echo ""
echo "   Then run:"
echo "   cd $PROJECT_ROOT && npx tsx src/cli.ts ingest"
echo "   cd $PROJECT_ROOT && npx tsx src/cli.ts query \"what kind of environment do goblins live in?\""
echo ""
echo "   Or run the full demo end-to-end:"
echo "   cd $PROJECT_ROOT && npx tsx src/cli.ts demo"
echo ""
echo " TIP: Export a monster page from D&D Beyond (e.g. the Goblin page) as HTML"
echo "      and save it as corpus/goblin.html for the lesson 101 demo."
echo ""
