# HANDOFF — Lesson 101: Scaffold the-stacks v2 (walking skeleton)

> **Audience:** Claude Code (the build tool). This is a precise, self-contained spec for the **101 build increment**.
> **You build; the teaching session specs.** Do not invent scope beyond this document. Where you must choose, prefer the simplest option that satisfies the acceptance criteria, and leave a comment explaining the choice.
> **Source of truth for the running architecture:** `topics/rag/build/STATE.md` — read it first, and update it when you finish.

## 0. The one non-negotiable constraint (applies to everything below)
**Write for a learner.** All code and config is **abundantly commented**, intending to be read by someone learning what was built — explain the *why*, not just the *what*. Not so verbose it hurts readability; do aim for "a smart reader new to RAG could follow this file top to bottom."
- Every **deliberately-dumb** implementation carries a comment naming the lesson that replaces it, e.g. `// DUMB (lesson 103): hashed vector → real Ollama embeddings`.
- Every **interface** has a doc comment explaining the contract and why it exists as a seam.
- The `README.md` explains the pipeline and how to run the day-one demo, for a newcomer.

## 1. Context (what this is, in one paragraph)
We are rebuilding **the-stacks** (a personal RAG system) from scratch as a **D&D corpus RAG** over D&D Beyond HTML, as the running build for an 8-lesson RAG course. Lesson 101 establishes a **walking skeleton**: the full `ingest → retrieve → generate` pipeline wired end-to-end and *runnable today*, with deliberately crude-but-real implementations behind stable interfaces. Later lessons swap implementations behind those interfaces — the interface is durable, the body graduates. See the build roadmap: ingest = lessons 102–103, retrieve = 104–105, generate = 106, eval/harden = 107–108.

## 2. Stack (faithful to v1 where it matters)
- **Language:** TypeScript on Node (org standard). Strict mode on.
- **Vector store:** **sqlite-vec** (via `better-sqlite3` + the `sqlite-vec` extension). File-based; no separate DB service.
- **Embeddings:** Ollama — **wired in compose but NOT called in 101** (real embeddings arrive in 103). 101 uses a trivial in-process embedder.
- **LLM (generate):** Anthropic SDK, **but must run with OR without an API key** (mirror the team's existing pattern). No key → generate degrades gracefully (see §5 generate).
- **Orchestration:** `docker-compose` for setup/teardown, with `bootstrap`/`teardown` scripts (v1 ethos).

## 3. Target file layout (`topics/rag/build/`)
```
topics/rag/build/
  STATE.md            # running architecture + build state (seeded by this handoff; you update it)
  README.md           # newcomer-facing: what it is, the pipeline, how to run the demo
  package.json
  tsconfig.json        # strict
  docker-compose.yml
  .gitignore           # corpus/, *.db, node_modules, .env
  .env.example         # ANTHROPIC_API_KEY (optional), OLLAMA_URL (for 103)
  scripts/
    bootstrap.sh       # bring stack up, init empty DB, print corpus-drop instructions
    teardown.sh        # tear stack down, remove DB/volumes/state
  corpus/              # GIT-IGNORED. Learner drops DDB HTML here. Ships empty (with a .gitkeep + README note).
  src/
    types.ts           # core types + the stage interfaces (the durable contracts)
    html.ts            # DUMB (102): crude HTML → text
    chunk.ts           # DUMB (102): naive fixed-size chunker
    embedder.ts        # Embedder interface + HashingEmbedder (DUMB, 103)
    store.ts           # Store interface over sqlite-vec (+ anticipated hybrid columns, unused)
    ingest.ts          # Ingestor: html → chunk → embed → store
    retrieve.ts        # Retriever: dense top-k (rerank = identity stub, 105)
    generate.ts        # Generator: assemble context → LLM (or degrade) → cited Answer
    pipeline.ts        # wire retrieve → generate
    cli.ts             # commands: ingest | query | demo
```

## 4. Interfaces / contracts (the durable part — design these carefully)
Define in `types.ts`. These must NOT need to change in later lessons; only implementations behind them change.

- `Chunk` = `{ id, text, source, section?, ord }` — a unit of retrievable content.
- `ChunkRecord` = `Chunk & { vector: number[]; rawText: string; meta: Record<string,string> }`
  - **Anticipation for hybrid (104):** include `rawText` (for BM25/lexical later) and `meta` (source/section tags for filtering) **now**, even though 101 populates them only trivially. Comment them as "populated richly in 102/104."
- `interface Embedder { embed(texts: string[]): Promise<number[][]>; readonly dim: number }`
- `interface Store { init(): void; upsert(records: ChunkRecord[]): void; searchDense(queryVec: number[], k: number): RankedChunk[] }`
  - Schema includes columns for `rawText` and `meta` (JSON) — unused by retrieval in 101, present for 104.
- `interface Retriever { retrieve(query: string, k: number): Promise<RankedChunk[]> }`
- `RankedChunk` = `{ chunk: Chunk; score: number }`
- `interface Reranker { rerank(query: string, hits: RankedChunk[]): Promise<RankedChunk[]> }` — 101 impl is **identity** (returns input unchanged). Comment: real cross-encoder/hosted rerank in 105.
- `interface Generator { generate(query: string, context: RankedChunk[]): Promise<Answer> }`
- `Answer` = `{ text: string; citations: { source: string; section?: string; chunkId: string }[] }`

## 5. The dumb-but-real bodies (101 scope — do NOT over-build)
- **html.ts** — crude tag-strip to text (a light dependency like `node-html-parser` is fine). `// DUMB (102): preserve structure + extract page metadata; chunking becomes near-free.`
- **chunk.ts** — naive fixed-size windows (~1000 chars, no smart boundaries). `// DUMB (102): semantic/structure-aware chunking.`
- **embedder.ts — `HashingEmbedder`** — deterministic bag-of-words hashed into a fixed-dim vector (e.g. dim 256), L2-normalized. It genuinely maps text→vector for nearest-neighbor; it is just semantically weak (that's the point — it motivates 103). `// DUMB (103): swap for OllamaEmbedder behind this same interface.`
- **store.ts** — sqlite-vec: create the vector table + a chunks table; `searchDense` does cosine/L2 top-k. Include the unused `rawText`/`meta` columns. Abundant comments on how sqlite-vec is loaded and queried (learner has not seen this).
- **ingest.ts** — read every file in `corpus/`, html→text→chunk→embed→upsert. Idempotent re-ingest (clear or upsert by id).
- **retrieve.ts** — embed the query with the same `Embedder`, `store.searchDense`, pass through the identity `Reranker`. `// 104: add sparse + fusion. 105: real rerank.`
- **generate.ts** — assemble retrieved chunks into a grounded prompt; call the LLM; return an `Answer` with citations. **If no `ANTHROPIC_API_KEY`:** skip the LLM call and return an `Answer` whose `text` states "no LLM key set — returning retrieved context" followed by the assembled context, with citations still populated. The skeleton must run end-to-end either way.
- **cli.ts** — `ingest`; `query "<question>"`; `demo` (runs the goblin demo end-to-end).

## 6. Day-one demo (the runnable artifact for this lesson)
With one Monster Manual goblin HTML page in `corpus/`:
1. `npm run ingest` populates sqlite-vec.
2. `npm run query -- "what kind of environment do goblins live in?"` (or `npm run demo`)
3. Output: a grounded answer (or the degraded context if no key) **with citations to the source page/chunk**.

## 7. Acceptance criteria
- [ ] `scripts/bootstrap.sh` brings the stack up and initializes an empty sqlite-vec DB; prints where to drop corpus HTML.
- [ ] Ingest of a single dropped HTML file produces chunks + vectors in sqlite-vec.
- [ ] `query` returns an answer grounded in retrieved chunks, **with citations**, end-to-end.
- [ ] Runs **with and without** `ANTHROPIC_API_KEY` (degrades, never crashes).
- [ ] Every stage sits behind its interface; an implementation can be swapped without touching callers (demonstrate by a one-line comment at each call site).
- [ ] `scripts/teardown.sh` removes DB/volumes/state cleanly.
- [ ] **Abundant, learner-facing comments throughout; every dumb seam tagged with its future lesson.**
- [ ] `corpus/` is git-ignored; **no copyrighted DDB HTML is committed**.
- [ ] `README.md` explains the pipeline and the demo for a newcomer; `STATE.md` updated to reflect what was built.

## 8. Out of scope (defer — do NOT build)
Real embeddings (103) · HTML-structure-preserving ingest + rich metadata (102) · smart chunking (102) · sparse/BM25 + hybrid fusion (104) · real reranking (105) · wiki router (106, on trial) · evaluation harness (107) · hardening (108). Leave honest, labeled stubs behind stable interfaces.

## 9. Post-build corrections (from the Claude Code build session — ✅ built & type-checked)
Environment gotchas hit during the actual build; baked back in so a re-run is clean:
- **Pin Node to LTS** (`volta.node` or `.nvmrc`). Node 26 breaks `better-sqlite3` native compilation.
- **`better-sqlite3` `^12.x`** (not 11) — v11 uses V8 APIs removed in Node 24.
- **Enumerate all deps explicitly** in `package.json`, incl. `sqlite-vec` and `dotenv` (imports alone don't install).
- **`@anthropic-ai/sdk@latest`** — versions < ~0.50 bundle `node-fetch`, which throws `FetchError: Premature close` on modern Node. Latest uses native fetch.
- **Diagnostic to document:** if `curl` to the API works but Node fails, the issue is the Node HTTP-client layer, not the network/proxy. (This session burned time on proxy/Pi-hole/IPv6 red herrings before finding the SDK.)
See `POST_BUILD_HANDOFF.md` for the full build report.
