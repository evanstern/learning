# Raw Notes / Build Log: RAG 101 — Foundations & the Design Space

> Running notes + build log. Decisions and the *why* go here in real time.

## Session setup decisions
- **Mode:** build-along (explicit opt-in). Socratic gate stays ON — reason out each step before writing it.
- **Build:** complete teardown + rebuild of **the-stacks** as a D&D RAG system.
- **Corpus:** D&D Beyond content (HTML source). Keep raw copyrighted text local — don't commit it into public teaching artifacts (anchor public examples on open SRD 5.1 where redistribution matters).
- **Stack:** **TypeScript** (org standardized). Known friction points to plan around: cross-encoder reranking (105) and Ragas (107) are Python-first → use hosted rerank API / transformers.js for 105, and re-implement eval metrics ourselves for 107 (more teachable anyway).
- **Code location:** inside Learnings at `topics/rag/build/` (personal OSS + teaching artifact, not Neumo business — mirrors the mcp/capstone precedent).
- **Arc:** full 8 lessons (see SERIES.md).
- **Process (delegated build):** this session teaches + specs; it does NOT write product code. Each lesson → `HANDOFF.md` (spec for Claude Code) + updates to `build/STATE.md`. Claude Code implements in `topics/rag/build/` in a separate session. Formalized in CLAUDE.md (build-along § "Delegated build via handoff").

## Tidbits / things to remember
- **Pre-filter vs post-filter (the-stacks history).** Original instinct was route-then-retrieve (wiki picks scope, then search) — risk: wrong scope makes the answer *unreachable*. We flipped to retrieve-then-prune (wide net first, wiki *subtracts* junk) — the wiki can only remove what was already found, never hide the right answer. "Use it to subtract, not to add." We tested this. → Reopen as the live debate in **106** (router on trial vs hybrid+rerank).
- **Fine-tuning vs RAG split:** fine-tuning changes how a model *behaves*; RAG changes what it *knows now*. Orthogonal. Don't fine-tune to inject facts (bad long-tail recall, can't cite, re-freezes weights).
- **Best *shape* is settled, best *parameters* are not** (and may never be portable). Chunk size / overlap / top-k / "+X% from reranking" are corpus-dependent → tune empirically (lesson 107), don't trust blog constants.

## Build decisions — 101 scaffold (walking skeleton)
- **Walking skeleton, not interfaces-only.** Stable interfaces (B's rigor) + dumbest *real* bodies (A's runnability). Stubs = first impl of a stable contract, not throwaway. Justified because (a) RAG's *shape* is settled → committing to ingest/retrieve/generate interfaces is low-risk, and (b) lesson 107 eval needs a runnable baseline from day one.
- **Principle: defer, don't gloss.** 101 crude everywhere; each stage gets its deep lesson (chunking 102, embeddings 103, hybrid 104, rerank 105, generate/routing 106). Nothing skipped in the course.
- **Dumbest-real per stage (101):** ingest = crude HTML→text + naive fixed chunk → sqlite rows; embed = trivial hashed bag-of-words vector behind `Embedder` iface → sqlite-vec; retrieve = dense top-k over dumb vectors behind `query→ranked chunks`; generate = stuff top-k → LLM → cited answer.
- **Day-one demo:** load Monster Manual "G" page → ask a Goblins question → grounded, cited answer.
- **Interface anticipation:** stored-record shape includes fields hybrid (104) needs (raw text for BM25, source/section metadata) now, bodies populate them later. Avoids reshaping in 104. (Evan's catch: ingest↔retrieve dependency.)
- **Embedder = hashed-trivial, not substring**, so the full vector path (embed→sqlite-vec→NN) is wired day one; 103 swaps the model behind a stable iface. Dumb embedder → visibly bad semantic search → motivates 103.
- **Harness:** docker-compose (app + sqlite-vec; Ollama service wired, unused until 103) + bootstrap/teardown scripts + manual corpus-load instructions. Same setup/teardown ethos as v1.
- **Stack:** TS + sqlite-vec + Ollama (faithful to v1's store/embedding choice).

## 102 seeds (don't lose)
- **v1 ingest insight:** store the HTML itself + per-page metadata → chunking becomes near-free. Revisit as the 102 ingest design.
- v1 corpus = DDB manuals/sourcebooks downloaded as zipped full-page HTML. Naive copy/paste text was "ok not great"; HTML+metadata was the better direction.

## 103 note
- v1 stopped at the vectorization/embedding experiments → 103 is the "past the frontier" lesson. Calibrate depth there; not a retread.

## 101 build — live observations (from Claude Code, see POST_BUILD_HANDOFF.md)
- **The dumb embedder failed on cue.** Query "what environment do goblins make their home in?" → ranked: 1 Githyanki ❌, 2 Grimlocks ❌, 3 Goblins ✅, 4 Stone Giants ❌, 5 Goblin lairs ✅. Two causes at once: **synonym blindness** ("environment/home" vs "lair/caves/dungeons" — bag-of-words has no semantics) + **stop-word pollution** (function words dominate the vector, so grammatically-similar junk scores high).
- **The LLM rescued it** by pulling the answer from chunks 3 & 5. Key teaching point: the generator can compensate for weak retrieval *only if the right chunk is somewhere in top-k*. Shrink k or grow the corpus and the answer vanishes — retrieval quality is the real ceiling.
- **MRR baseline = 1/3 ≈ 0.33** on that query (first relevant at rank 3). Target after 103 real embeddings: **MRR = 1.0** (goblin chunks at 1 & 2). This is our 107 before/after story.
- **Part of the noise is a chunking bug, not just the embedder:** naive fixed windows split *across monster boundaries* (a chunk straddling Githyanki→Goblin). 102 structure-aware chunking (one chunk per monster) should kill that noise — a concrete opening demo for 102.
- **Degraded mode is a sleeper feature:** no API key → returns retrieved context, never crashes. Worth teaching as a design value.
- **Build env gotchas** (now in HANDOFF §9): Node LTS required (26 breaks better-sqlite3), better-sqlite3 v12, enumerate deps (sqlite-vec/dotenv), @anthropic-ai/sdk@latest (old = node-fetch premature close). Diagnostic: curl works + Node fails ⇒ Node HTTP layer, not network.

## Tangents worth revisiting

## Open questions
