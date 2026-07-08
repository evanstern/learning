# HANDOFF — Lesson 103: Real embeddings (Ollama) + vector store

> **Audience:** Claude Code. Precise, self-contained spec for the **103 build increment**.
> **You build; the teaching session specs.** Read `topics/rag/build/STATE.md` first; update it when done.
> This increment **graduates embeddings only** — it swaps the `Embedder` implementation behind the existing interface. Retrieval (104), rerank (105), generation (106) are untouched.
> **Evaluate this spec before building.** If something here is wrong or unbuildable, object with a fix (per `/build-me`). Two known wrinkles are pre-flagged in §6 and §7 — confirm or correct them.

## 0. The non-negotiable constraint
**Write for a learner.** Abundant, *why*-first comments. Every deliberately-deferred seam tagged with the lesson that fills it (`// DEFERRED (104/105/…): …`). Replace the `// DUMB (103)` markers with `// GRADUATED (103)` notes. Update `README.md` if the run/commands change.

## 1. Context
After 102, chunks are clean (one semantic unit per chunk, correct breadcrumbs), but ranking is still driven by the **deliberately dumb `HashingEmbedder`** (bag-of-words hashing, 256-dim). Its two blind spots — **synonym blindness** ("home"/"lair" land in unrelated buckets) and **stop-word pollution** (shared boilerplate pulls unrelated chunks together) — are exactly why the goblin demo query returns a clean Goblins chunk at #1 but unrelated monsters (**Grimlock**, **Gith**) at #2/#3.

This increment replaces `HashingEmbedder` with a **learned, local embedding model served by Ollama** (`nomic-embed-text`, **768-dim**). The expected payoff: the goblin query's *neighbors* get fixed — real goblin chunks rise, unrelated monsters fall — moving the carried-forward **MRR ≈ 0.33 → ~1.0** on that query. (The *lexical/identifier* gap — exact names like "Tasha's Hideous Laughter" — is **not** this lesson; that's 104 hybrid. Do not add sparse/BM25 here.)

## 2. What to build
A new `OllamaEmbedder implements Embedder` (in `src/embedder.ts`, alongside the retained `HashingEmbedder`):

- **`readonly dim = 768`** (for `nomic-embed-text`).
- **`embed(texts: string[]): Promise<number[][]>`** — calls the local Ollama server and returns one vector per input text, **in input order**.
  - Endpoint: `POST {OLLAMA_URL}/api/embed` with body `{ model: "nomic-embed-text", input: texts }` (the batch endpoint; returns `{ embeddings: number[][] }`). Use the global `fetch` (Node 24) — **no new npm dependency**.
  - `OLLAMA_URL` from `process.env.OLLAMA_URL ?? "http://localhost:11434"`.
  - **L2-NORMALIZE every returned vector** before handing it back (reuse the same `l2normalize` helper `HashingEmbedder` uses — extract/share it). **Why this is mandatory:** `SqliteVecStore.searchDense` ranks by **L2 distance**, and `nomic-embed-text` does **not** emit unit vectors. Normalizing puts all vectors on the unit sphere, where L2 ranking == cosine ranking (the lesson's core point). Skip this and ranking gets distorted by vector magnitude — the exact failure 103 is supposed to fix.
  - Fail loudly with a clear message if Ollama is unreachable or the model isn't pulled (this is the one path that *does* hard-depend on a service — unlike generation, embedding can't degrade gracefully).

## 3. Wire it up (one-line swap + service activation)
- **`src/cli.ts`** — flip the already-present hint: replace `const embedder = new HashingEmbedder(256);` with `const embedder = new OllamaEmbedder(process.env.OLLAMA_URL ?? "http://localhost:11434");`. **Leave `const store = new SqliteVecStore(DB_PATH, embedder.dim);` as-is** — it already reads `embedder.dim`, so the vec0 table is created at `float[768]` automatically. No store signature change.
- **`docker-compose.yml`** — Ollama is currently gated behind `profiles: ["embeddings"]` (dormant). Activate it for 103 (remove the profile gate, or have bootstrap bring it up with `--profile embeddings`). Add the model pull.
- **`scripts/bootstrap.sh`** — after `docker compose up`, pull the model: `docker compose exec -T ollama ollama pull nomic-embed-text` (or equivalent). Bootstrap should leave the stack ready to ingest.
- **`.env.example`** — uncomment/keep `OLLAMA_URL=http://localhost:11434`; note it's now live (was dormant pre-103).

## 4. The dim change ⇒ mandatory re-ingest (call this out in README)
`dim` goes 256 → 768. The existing `stacks.db` holds 256-dim vectors in a `float[256]` column — **incompatible**, and (per 102) it also holds stale ids. **Wipe and re-ingest:** `./scripts/teardown.sh` (or `rm stacks.db`), bootstrap, then `npx tsx src/cli.ts ingest`. Document that vectors are a **derived cache** of (corpus + model): wiping is safe because the source HTML in `corpus/` is the source of truth. State plainly in README: *changing the embedding model or its dim always requires a full re-ingest — there is no in-place migration.*

## 5. What NOT to touch (out of scope)
- `src/retrieve.ts` — query path already embeds with the injected embedder and calls `searchDense`. No hybrid/sparse (that's 104).
- `src/store.ts` — **no schema or API change.** *Two permitted edits (both applied in the build):*
  1. Fix the inaccurate docstring on `searchDense` that calls sqlite-vec "approximate nearest-neighbor (ANN) search" — sqlite-vec does **exact brute-force KNN**, not ANN. Correct the comment (mirrors the 102 "comments must match reality" lesson). Do **not** add an ANN index — brute-force is the right call at our scale (exact, no tuning); the `Store` seam stays swappable if we ever outgrow it.
  2. **`store.init()` dimension guard (added in the return leg, author-approved).** `init()` reads the existing `vec_chunks` declared dimension from `sqlite_master`; if it disagrees with the current embedder's `dim`, it **throws a clear "wipe + re-ingest" error before doing any work** — rather than letting an opaque `Dimension mismatch` surface mid-transaction from inside `upsert()`. **Deliberately NOT auto-wipe** (silently deleting the user's DB is the wrong default); the message gives the one-line safe fix. This turns 103's headline rule ("change the model/dim ⇒ full re-ingest") from a README footnote into a code-enforced, fail-loud guard — a teaching beat alongside the OllamaEmbedder "fail loudly" path. A future rebuild must keep this guard.
- `src/generate.ts`, `src/pipeline.ts`, interfaces in `types.ts` — unchanged.
- Keep `HashingEmbedder` in the file (don't delete) — it's a useful reference impl and a fallback.

## 6. Known wrinkle to confirm — `nomic-embed-text` task prefixes
`nomic-embed-text` was trained with **asymmetric task-instruction prefixes**: `search_document:` for stored passages and `search_query:` for queries. Using them can improve retrieval, but it breaks the **symmetric** `Embedder.embed(texts)` contract (ingest and query both call the same method, which wouldn't know which prefix to apply).

**Recommended default for this lesson: do NOT use prefixes** — keep the clean interface-preserving swap. The goblin/Grimlock distinction is semantically wide enough that bare `nomic-embed-text` should comfortably hit the AC. Tag prefixing as a **deferred tuning knob** (`// DEFERRED (107 tuning): nomic task prefixes for asymmetric retrieval`). **If** the AC ranking is *not* met without prefixes, that's the moment to introduce prefixes — and note in POST_BUILD how you threaded them without breaking the interface (e.g. an optional `embed(texts, role?)` param defaulted so existing callers are unaffected). Flag your choice either way.

## 7. Corpus & demo query
Reads DDB HTML from the git-ignored `corpus/` (the Monster Manual "G" page already in use). The canonical demo query (run by `npx tsx src/cli.ts demo` and the AC below) is:

> `what kind of environment do goblins live in?`

(STATE.md also references the longer phrasing "…like to make their home in?" — align both to the demo command's wording so the before/after MRR story is reproducible.)

## 8. Acceptance criteria
- [ ] `OllamaEmbedder` implements `Embedder`, `dim === 768`, `embed()` batches, returns one **L2-normalized** vector per input in order, fails loudly if Ollama/model is unavailable.
- [ ] `cli.ts` uses `OllamaEmbedder`; `store` is constructed with `embedder.dim` (now 768); vec0 table is `float[768]` after a fresh ingest.
- [ ] Bootstrap brings Ollama up and pulls `nomic-embed-text`; a clean `teardown → bootstrap → ingest` succeeds from scratch.
- [ ] **The payoff:** after re-ingest, `npx tsx src/cli.ts query "what kind of environment do goblins live in?"` ranks the clean **Goblins** chunk **#1** with the other goblin chunks at the **top of the list**; **Grimlock and Gith no longer appear in the top results**. Report the new ranking and the **MRR (target ~1.0, up from 0.33)**. *(As-built: #1 Goblins, #3 Goblin Boss, #4 Goblin → MRR 1.0. A semantically-honest intruder like #2 Deep Gnome — also an underground-dweller — is expected and is exactly the lexical/identifier gap **104 hybrid** closes; don't treat it as a miss.)*
- [ ] Re-ingest is idempotent (stable ids/counts across runs; no vec0 crash — the 102 fix holds).
- [ ] `store.ts` "ANN/approximate" docstring corrected to "exact brute-force KNN." No ANN index added.
- [ ] Pipeline still runs end-to-end **with and without** `ANTHROPIC_API_KEY` (generation path untouched; degraded path returns retrieved context).
- [ ] `tsc --noEmit` clean. Learner comments throughout; `// DUMB (103)` → `// GRADUATED (103)`; deferred seams tagged. `README.md` + `build/STATE.md` updated.

## 9. Feed-forward to note in POST_BUILD_HANDOFF.md
- The before/after ranking on the goblin query (exact ranks + MRR). Did neighbors actually clean up as predicted?
- Whether prefixes were needed (§6) and, if so, how they were threaded without breaking the interface.
- Embedding **latency/throughput** at ingest (48 chunks) — first real "embedding cost" data point; feeds the cost discussion and 107.
- Any chunks that *still* mis-rank — candidates for the 104 hybrid (lexical/identifier) story.
- Confirm/curate the leaked "chrome" chunks from 102 (jump-nav TOC, subtitle) didn't pollute the new top-K.
