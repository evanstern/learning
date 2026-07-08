# the-stacks v2 — build STATE

> **Single source of truth** for the running architecture and what's been built so far.
> Every lesson's `HANDOFF.md` builds on this; **update this file at the end of each increment.**
> Build tool: **Claude Code.** The teaching session (teach-me) only specs — it does not write product code.

**As of:** lesson 103 — *BUILT + verified* (`OllamaEmbedder` live). The embedder graduated from `HashingEmbedder` → `OllamaEmbedder` (`nomic-embed-text`, **768-dim**, local via Ollama) behind the unchanged `Embedder` interface; vectors are L2-normalized so sqlite-vec's L2 ranking == cosine. Dim 256→768 forced a wipe + re-ingest (vectors are a derived cache). **Payoff verified live: goblin demo query MRR 0.33 → 1.0** — Goblins ranks #1 (0.586, clearly ahead), Grimlock/Gith gone from the top 12. Runs end-to-end with/without an API key. See `103-embeddings/POST_BUILD_HANDOFF.md`. **Next:** teach-me return leg (deck + guide), then 104 hybrid retrieval (the surviving #2 Deep Gnome / Giants intruders are its motivation).

---

## What this is
A from-scratch rebuild of **the-stacks** as a **D&D corpus RAG** over D&D Beyond HTML, serving as the running build for an 8-lesson RAG course (`topics/rag/`). Built as a **walking skeleton**: the full pipeline runs end-to-end from lesson 101 with deliberately crude implementations; each later lesson swaps a real implementation behind a stable interface.

## Project-wide conventions (hold for every lesson)
- **Learner-facing comments everywhere.** Code/config is abundantly commented to be *read and learned from* — explain the *why*. Every deliberately-dumb seam is tagged with the lesson that replaces it: `// DUMB (lesson NNN): ...`.
- **Stable interfaces, graduating bodies.** Interfaces in `src/types.ts` are the durable contract; lessons change implementations, not signatures. If a signature must change, that's a design event — note it here.
- **Runs with or without an LLM key.** Generate degrades gracefully; the skeleton never hard-depends on network/keys to *run*.
- **Corpus is local + git-ignored.** Raw DDB HTML is copyrighted — it lives in `corpus/` (git-ignored), never committed. Public examples use the open SRD where redistribution matters.
- **Setup/teardown via docker-compose** + `scripts/bootstrap.sh` / `scripts/teardown.sh`.
- **Stack:** TypeScript (strict) · sqlite-vec · Ollama (embeddings, **live from 103**) · Anthropic SDK (generate). Ollama is a **hard** dependency at ingest/query from 103 — embedding cannot degrade gracefully (no vectors = nothing to search), unlike generation.

## Architecture (pipeline = module layout = build order)
```
ingest ──▶ retrieve ──▶ generate
 102,103     104,105       106          (107 eval · 108 harden wrap the whole thing)
```
- **ingest** — read corpus HTML → chunk → embed → store in sqlite-vec.
- **retrieve** — query → (filter) → search → rerank → ranked chunks.
- **generate** — assemble retrieved context → LLM → cited answer.

## Interfaces (the durable contracts)
| Interface | Contract | 101 impl | Graduates in |
|---|---|---|---|
| `Embedder` | `embed(texts)→vectors`, `dim` | ✅ 103: `OllamaEmbedder` (nomic-embed-text, 768d, L2-normalized); `HashingEmbedder` retained as fallback | — |
| `Store` | `init`, `upsert`, `searchDense(vec,k)` | sqlite-vec; cosine/L2 top-k | 104 (sparse/hybrid columns used) |
| `Retriever` | `retrieve(query,k)→ranked` | dense top-k + identity rerank | 104 (hybrid+fusion) |
| `Reranker` | `rerank(query,hits)→hits` | identity (no-op) | 105 (cross-encoder / hosted) |
| `Generator` | `generate(query,ctx)→Answer` | assemble + LLM or degrade | 106 (assembly polish, routing) |

`ChunkRecord` carries `rawText` + `meta` from 101 so **hybrid (104) needs no schema reshape** — anticipated dependency between ingest and retrieve. As of 102, `meta` is **populated** (`source`, `breadcrumbs` JSON, `chunkId`, `kind`); `rawText` still mirrors `text` (104 may diverge them for BM25).

## Build state by stage
| Stage / piece | Status | Notes |
|---|---|---|
| Repo scaffold, interfaces, CLI | ✅ done (101) | walking skeleton; all interfaces in types.ts |
| Docker harness + bootstrap/teardown | ✅ done (101) · 🔧 103 | bootstrap.sh / teardown.sh; **103: Ollama profile gate removed (now active)** + bootstrap waits for readiness and pulls `nomic-embed-text`. Gotcha (now guarded): bootstrap's ingest step would crash on a stale 256-dim DB — `store.init()` now catches the dim mismatch and prints a "wipe + re-ingest" message; README also documents wiping first. |
| Ingest: HTML→text, naive chunk | ✅ done (102) | GRADUATED 102: structure-aware chunking (1 chunk/heading section, size guard sub-split/merge, atomic stat-block divs kept whole) + metadata sidecar (`source`, `breadcrumbs[]` JSON, `chunkId`, `kind`). One clean chunk per monster. See `102-ingest/POST_BUILD_HANDOFF.md` |
| Embeddings | ✅ 101 trivial (HashingEmbedder, 256-dim) · ✅ **103 built + verified** (OllamaEmbedder, 768-dim) | GRADUATED 103: `OllamaEmbedder` (`nomic-embed-text`, 768-dim, local) behind unchanged `Embedder`; L2-normalizes every vector (store ranks by L2 → normalize = cosine-equivalent); fails loudly if Ollama unreachable / model unpulled. dim 256→768 forced wipe + re-ingest. **Verified: goblin MRR 0.33→1.0.** See `103-embeddings/POST_BUILD_HANDOFF.md`. |
| Vector store (sqlite-vec) | ✅ done (101) · 🔧 102 fix · 🔧 103 | two-table schema: chunks + vec_chunks (now `float[768]`); meta populated. **102 fix:** `upsert` DELETE-then-INSERTs into the vec0 table (`INSERT OR REPLACE` unsupported on vec0 PKs). **103:** corrected docstring — sqlite-vec does **exact brute-force KNN**, not ANN. **103 (return leg, author-approved):** `init()` now detects a DB built at a different embedding dim and fails loudly with a "wipe + re-ingest" message (NOT auto-wipe) instead of an opaque mid-transaction `SqliteError`. No schema/API change. |
| Retrieve: dense top-k | ✅ done (101) | DenseRetriever; IdentityReranker stub |
| Rerank | ✅ identity stub (101) | real = 105 |
| Generate: cited answer | ✅ done (101) | AnthropicGenerator; degrades gracefully without key |
| Wiki router | ⬜ on trial in 106 | pre-filter (risky) vs post-filter/prune (safe) — see 101 raw-notes |
| Evaluation harness | ⬜ 107 | needs the runnable baseline this skeleton provides |
| Hardening / failure modes | ⬜ 108 | |

## Open design threads (decide in their lesson)
- **102:** ✅ built & verified — structure-aware chunking (one chunk/heading section, size guard, atomic stat-block divs kept whole) + metadata sidecar (`source`, `breadcrumbs[]` JSON, `chunkId`, `kind`). Embeddings stayed dumb (that's 103). **Findings (see POST_BUILD):** (1) DDB has no `<table>` tags — stat blocks are `div.stat-block-background`, handled as atomic blocks; (2) fixed a latent vec0 re-ingest crash in `store.ts`; (3) breadcrumbs dual-homed (`section` string for citations + `meta.breadcrumbs` JSON for future filters). Heterogeneous-page check only partially done (no non-monster page in corpus yet).
- **Parked — structured retrieval:** typed entity fields + a normalized "monster" DB (the the-stacks direction). `meta` is a JSON bag so this is non-breaking to add later. Defer until baselines exist; needs its own lesson.
- **103:** ✅ RESOLVED. `OllamaEmbedder` (nomic-embed-text, 768d, local, L2-normalized) behind the unchanged `Embedder`. Demo query aligned to `"what kind of environment do goblins live in?"` (matches the `demo` command). **Result: MRR 0.33→1.0** — Goblins #1 (0.586, clearly ahead), Goblin Boss #3, Goblin #4; Grimlock/Gith gone from top 12. Did NOT need nomic task prefixes (deferred to 107). sqlite-vec confirmed exact brute-force KNN (not ANN). **Surviving intruders (#2 Deep Gnome, Giants cluster) = the lexical/identifier gap → 104's motivation.** See POST_BUILD.
- **104:** which sparse method (BM25 vs SPLADE) and which fusion (RRF default); populate `meta`/`rawText` richly (columns already exist — no migration). **Concrete "before" captured from the 103 run:** the goblin habitat query still ranks Deep Gnome #2 and a Giants cluster ahead of Goblin Boss/Goblin — semantically-honest "lives underground" neighbors that a literal `goblin` token would outrank. That's the live case for hybrid dense+sparse fusion.
- **106:** wiki router on trial vs hybrid+rerank — does routing earn its keep, and pre-filter vs post-filter.
- **107:** eval baseline captured from the 101 run — **MRR ≈ 0.33** on the goblin query (first relevant at rank 3); **✅ achieved 1.0 after 103** (first relevant at rank 1). Concrete before/after story now real. First embedding-cost data point: **~10 s to embed 48 chunks** (~200 ms/chunk, single batched `/api/embed` call, CPU Ollama) — baseline for the cost discussion.

## Carryforward from the 101 build run (live, preserved — do NOT "fix" early)
- The hashing embedder mis-ranks (synonym blindness + stop-word pollution); the LLM still answered from low-ranked chunks. This failure is **the 103 motivator** — keep it.
- Part of the retrieval noise is a **chunking** artifact (naive windows split across monster boundaries) → a 102 win, not only a 103 one. **102 confirmed this:** the top goblin hit is now a clean goblin-only chunk (content fixed), but its neighbors are still wrong monsters (ranking still embedding-bound → 103). Clean split of blame.
- Full build report: `topics/rag/101-foundations/POST_BUILD_HANDOFF.md`.
