# HANDOFF — Lesson 102: Ingestion done right (structure-aware chunking + metadata)

> **Audience:** Claude Code. Precise, self-contained spec for the **102 build increment**.
> **You build; the teaching session specs.** Read `topics/rag/build/STATE.md` first; update it when done.
> This increment **graduates ingest only** — it does not touch embeddings, retrieval, or generation.

## 0. The non-negotiable constraint
**Write for a learner.** Abundant, *why*-first comments. Every deliberately-deferred seam tagged with the lesson that fills it (`// DEFERRED (103/104/…): …`). Update `README.md` if the run/commands change.

## 1. Context
The 101 walking skeleton chunks with naive fixed-size windows, which split *across monster boundaries* (a chunk straddling Githyanki→Goblin), polluting both embeddings and citations. 102 replaces that with **structure-aware chunking**: parse the page's DOM, split on its heading structure into one semantic unit per chunk, and attach a lightweight metadata sidecar. Embeddings stay the dumb `HashingEmbedder` (real embeddings are 103), so semantic ranking won't be fixed here — but **chunk content and citations should become clean**.

## 2. What a chunk is (the design)
- **A chunk = one semantic unit**, derived from the heading hierarchy. For the Monster Manual that's **one monster**; generally it's the **leaf-level heading section**.
- **Size is a guard, not the boundary:**
  - Oversized section → **sub-split** recursively into ≤ a max size (pick a generous default, e.g. ~1500 tokens-worth of chars; comment it as a *guard we'll tune in 107, not a magic number*).
  - Trivially tiny adjacent fragments → **merge** into their parent section.
- **Tables / stat blocks kept whole** — never split a table mid-row. Keep a stat block as its own chunk (or attached to its section), tagged so it's identifiable.
- **Generality matters:** the corpus has heterogeneous pages (monster lists, prose chapters, table-heavy pages). Chunk on the **generic heading hierarchy**, not on anything monster-specific.

## 3. Metadata sidecar (populate the `meta` bag — no schema change)
The 101 `ChunkRecord` already carries `rawText` + `meta` (JSON) and a stable id. Populate:
- `source` — the book / file the chunk came from (e.g. "Monster Manual").
- `breadcrumbs` — ordered heading trail to the chunk (e.g. `["Monster Manual","Monsters","Goblin"]`). This is the citation string *and* a future filter key.
- `chunkId` — stable id (already exists); keep it deterministic so re-ingest is idempotent.
- **Deferred, do NOT add now:** entity-type, typed stat fields, any normalized entity table. `meta` is a JSON bag so these are non-breaking to add later (a future structured-retrieval lesson).

## 4. What to change (and what NOT to)
**Change (ingest only):**
- `src/html.ts` — replace crude tag-strip with **structure-aware parsing**: walk the DOM, capture the heading hierarchy + each section's text and any tables. (A real HTML parser like `node-html-parser` is fine.)
- `src/chunk.ts` — replace fixed windows with **section-based chunking** + the size guard (sub-split / merge) + table-whole handling.
- `src/ingest.ts` — assemble chunks, build `breadcrumbs`, set `source`, write `rawText` + `meta`.
- Tag the old behaviors' replacement clearly; remove the `// DUMB (102)` markers now that they're done.

**Do NOT touch (out of scope):**
- `src/embedder.ts` — still `HashingEmbedder`. Real embeddings are **103**. (If chunk text changes shape, re-ingest; dim is unchanged.)
- `src/retrieve.ts`, `src/generate.ts`, interfaces in `types.ts` — unchanged. No sparse/hybrid (104), no rerank (105).
- No entity-type extraction, no structured/normalized DB.

## 5. Corpus
Reads DDB HTML from the git-ignored `corpus/`. The day-one demo uses the Monster Manual "G" page already in use. Keep corpus local; nothing copyrighted committed.

## 6. Acceptance criteria
- [ ] Ingesting the "G" page yields **one chunk per monster** (no chunk straddles two monsters); stat-block tables are intact, not split mid-row.
- [ ] Each chunk's `meta` has `source` and a correct `breadcrumbs` trail; `chunkId` is stable across re-ingest.
- [ ] Oversized sections sub-split; trivially tiny ones merge — verify on a long entry.
- [ ] Re-running the goblin query: the retrieved goblin chunk is now **clean per-monster** and the citation shows the breadcrumb trail. *(Ranking may still be poor — dumb embedder — that's 103. Assert chunk cleanliness + citation, not rank.)*
- [ ] Heterogeneous check: ingest one non-monster page (a prose/rules section) and confirm it chunks sensibly on its headings.
- [ ] Embeddings/retrieval/generation code unchanged; pipeline still runs end-to-end, with and without an API key.
- [ ] Learner-facing comments throughout; deferred seams tagged. `README.md` + `build/STATE.md` updated.

## 7. Feed-forward to note in POST_BUILD_HANDOFF.md
- How much of the 101 retrieval noise was *chunking* vs *embedding* (compare goblin-query chunk content before/after, even though rank won't move yet).
- Any page shapes that resisted clean structure parsing (for the lesson's edge-case list).
