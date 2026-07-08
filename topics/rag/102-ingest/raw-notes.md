# Raw Notes / Build Log: RAG 102 — Ingestion (HTML → chunks)

> Running notes + build log. Decisions and the *why* go here in real time.

## Carry-in from 101
- **Live failure to fix here (partly):** naive fixed windows split *across monster boundaries* — a chunk straddling Githyanki→Goblin confused both embedding and citation. Structure-aware chunking (one chunk per monster/section) should visibly cut the noise. (Embedding semantics is 103's job; this is the chunking half.)
- **v1 insight to build for real:** store the HTML itself + per-page metadata → chunking becomes near-free. This lesson's core design.
- **Anticipated fields already in the schema** (`rawText`, `meta`) from the 101 walking skeleton — 102 populates them richly, no migration.
- **Epistemic frame holds:** the research corpus *killed* "optimal chunk size 200–500 / overlap 10–20%" as folk wisdom (no controlled benchmark). Don't chase a magic number — decide boundaries by structure, then measure on our corpus (107).

## Build decisions — 102 ingest
- **A chunk = one semantic unit, not a file or N tokens.** For the Monster Manual that's one monster; generally it's the leaf-level heading section. Core tension: precision (sharp, one-idea chunk) vs completeness (the whole answer lives in one chunk). Pick the smallest unit that still holds a whole answer.
- **Boundaries come from the DOM.** Parse the heading hierarchy → split on structure. The heading you split on *is* the breadcrumb (near-free), reinforcing the v1 "store HTML + metadata" insight.
- **Size is a guard, not the boundary.** Oversized section → sub-split (recursive, with a generous max — a guard we tune in 107, NOT a magic number). Tiny → merge. Tables kept whole (never split a stat block mid-row).
- **Metadata sidecar (the decided cut):** `source`, `breadcrumbs[]` (heading trail — general across page shapes, doubles as citation "MM › Monsters › Goblin"), `chunkId`. Populates the `meta` JSON bag anticipated in 101 → no schema change.
- **Dropped/deferred:** entity-type and typed fields (more than a baseline needs); the full normalized "monster" DB → parked for a later **structured-retrieval** lesson. `meta` is a JSON bag so adding fields later is non-breaking. Baselines first.
- **Two complementary layers (the the-stacks direction):** unstructured chunks (fuzzy vector search) + structured sidecar (exact filter). Same machinery as the 101 router (pre/post-filter) and 104 hybrid metadata.
- **Scope:** 102 only touches ingest (parse + chunk + metadata). Embeddings stay the dumb HashingEmbedder (that's 103); retrieve/generate unchanged.

## Tidbits / things to remember

## Tangents worth revisiting

## Open questions
