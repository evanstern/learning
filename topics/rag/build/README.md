# the-stacks v2 — D&D Corpus RAG

A walking skeleton for an 8-lesson RAG course. The full `ingest → retrieve → generate` pipeline runs end-to-end from lesson 101 with deliberately crude implementations; each later lesson swaps a real implementation behind a stable interface.

---

## What is RAG?

**Retrieval-Augmented Generation** is a pattern for grounding LLM answers in a specific document corpus:

```
Your question
     │
     ▼
┌─────────────┐      ┌──────────────────┐      ┌────────────────┐
│   Ingest    │      │    Retrieve      │      │    Generate    │
│             │      │                  │      │                │
│ HTML → text │      │ Embed query      │      │ Assemble ctx   │
│ text → chunks├─────►dense vector search├─────►LLM call        │
│ chunks→vectors│    │ (+ rerank)       │      │→ cited Answer  │
│ → sqlite-vec│      │                  │      │                │
└─────────────┘      └──────────────────┘      └────────────────┘
```

The key insight: instead of asking the LLM "what do you know about goblins?", we:
1. Find the relevant chunks from *our* corpus (via vector similarity)
2. Stuff them into the prompt as context
3. Ask the LLM to answer *from that context only*

This makes the answer grounded, citable, and immune to LLM hallucination about our specific corpus.

---

## The Pipeline (lesson 101)

| Stage | File | Current Implementation | Graduates in |
|---|---|---|---|
| HTML → structure | `src/html.ts` | ✅ 102: structure-aware DOM parse (heading hierarchy + classified blocks) | — |
| sections → chunks | `src/chunk.ts` | ✅ 102: one chunk per heading section + size guard; atomic stat blocks kept whole | — |
| chunks → vectors | `src/embedder.ts` | ✅ 103: `OllamaEmbedder` (nomic-embed-text, 768-dim, local) — `HashingEmbedder` retained as fallback | — |
| vector storage | `src/store.ts` | sqlite-vec (file-based) | Lesson 104 |
| query → chunks | `src/retrieve.ts` | Dense top-k + identity rerank | Lessons 104, 105 |
| chunks → answer | `src/generate.ts` | Grounded prompt + Claude (or degrade) | Lesson 106 |

Each stage is behind an interface in `src/types.ts`. The **interface is the durable contract**; only the body graduates.

---

## Quick Start

### 1. Bootstrap

```bash
cd topics/rag/build
./scripts/bootstrap.sh
```

This installs dependencies, **starts Ollama (docker-compose) and pulls `nomic-embed-text`**, creates the sqlite-vec DB schema, and ingests whatever is in `corpus/`.

> **Lesson 103 added a hard dependency: a running Ollama.** Embeddings are now produced by a real local model (`nomic-embed-text`, 768-dim) served by Ollama on `:11434`. Unlike the Anthropic key (which degrades gracefully), **embedding cannot degrade** — no Ollama means no vectors to store or search, so ingest/query fail loudly with a fix-it message. `bootstrap.sh` brings Ollama up via docker-compose; a native `ollama serve` on the host works too (same URL).

### 2. Add corpus files

Drop D&D Beyond HTML pages into `corpus/`. For the lesson 101 demo, you need at least one monster page (e.g. the Goblin page saved as `corpus/goblin.html`).

> **How to get a D&D Beyond page as HTML:** Open the monster page in your browser, then File → Save Page As → "Webpage, HTML Only". Save to `corpus/`.

### 3. Ingest

```bash
npx tsx src/cli.ts ingest
```

Reads all `.html` files from `corpus/`, parses the heading structure, splits into **one chunk per section** (one monster per chunk; stat blocks kept whole), attaches a metadata sidecar (`source`, `breadcrumbs`, `kind`), embeds with the hashing embedder, and upserts into `stacks.db`.

> **Upgrading from a lesson-101 DB?** Wipe it once first (`./scripts/teardown.sh` or `rm stacks.db`) — 101 produced hundreds of fixed-window chunks whose ids no longer exist in 102, and they'd linger as orphans. After the wipe, re-ingest is idempotent in place.

> **Upgrading from a 101/102 DB into 103 — re-ingest is MANDATORY (not optional).** The embedding dimension changed `256 → 768` (hashing → `nomic-embed-text`). The old `stacks.db` holds vectors in a `float[256]` column, which is **incompatible** with the new `float[768]` — there is no in-place migration. **Changing the embedding model or its dimension always requires a full wipe + re-ingest.** That's safe: the vectors are a **derived cache** of `(corpus HTML + model)` — the source of truth is the HTML in `corpus/`, so you can always rebuild them. Run: `./scripts/teardown.sh` (or `rm stacks.db`) → `./scripts/bootstrap.sh` → `npx tsx src/cli.ts ingest`.

### 4. Query

```bash
npx tsx src/cli.ts query "what kind of environment do goblins live in?"
```

Embeds the query, searches sqlite-vec for the top-5 similar chunks, and generates a grounded answer (with citations) via Claude — or returns the raw context if no API key is set.

### 5. Demo (one-shot)

```bash
npx tsx src/cli.ts demo
```

Runs ingest + the goblin query end-to-end.

---

## Configuration

Copy `.env.example` to `.env` and set your keys:

```bash
cp .env.example .env
# Edit .env
```

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Enables LLM generation. Without it, the pipeline returns raw retrieved context. |
| `OLLAMA_URL` | Yes (from lesson 103) | URL for the Ollama embedding server. Defaults to `http://localhost:11434`. A reachable Ollama with `nomic-embed-text` pulled is required to ingest or query. |

---

## Teardown

```bash
./scripts/teardown.sh        # Remove DB, dist/, node_modules
./scripts/teardown.sh --full # Also remove corpus HTML + .env
```

---

## Architecture Notes

- **sqlite-vec** runs as a SQLite extension — no separate DB server, just `stacks.db`. The schema has two tables: `chunks` (metadata) and `vec_chunks` (vectors), joined at query time.
- **Embeddings (103): `OllamaEmbedder`** calls a local Ollama server running `nomic-embed-text` (768-dim) and **L2-normalizes** every vector. Normalizing is mandatory: sqlite-vec ranks by L2 distance, and on the unit sphere L2-distance order equals cosine-similarity order — the metric we actually want. `nomic-embed-text` does *not* emit unit vectors on its own, so skipping normalization would let vector magnitude distort ranking.
- **`HashingEmbedder` (101, retained as fallback)** uses the hashing trick: bag-of-words token counts hashed into a 256-dim vector, L2-normalized. Deterministic, no network, genuinely does nearest-neighbor geometry — just weak semantics (identical words match; synonyms don't). That weakness (synonym blindness + stop-word pollution) was the lesson 103 motivator that `OllamaEmbedder` fixes.
- **sqlite-vec does exact, brute-force KNN** (not approximate/ANN) — it compares the query against every stored vector. Exact and tuning-free, which is the right call at this scale (a few dozen chunks). The `Store` seam stays swappable if we ever outgrow exact search.
- The pipeline **never crashes without an API key** — `AnthropicGenerator` detects the missing key at startup and falls back to returning retrieved context.
- **Corpus is git-ignored.** D&D Beyond HTML is copyrighted. `corpus/` stays local.
