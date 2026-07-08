# Presenter's Guide — RAG 102: Ingestion (HTML → chunks)

Companion to `deck.html`. Per-slide: an **opening line** (say this), **talking points**, **if asked** (anticipated questions), and a **glossary** at the end. Built after the build, so it folds in the live findings (slides 8–9).

> **Through-line for the whole deck:** 102 owns *chunk content*; it deliberately does **not** fix *ranking* (that's 103's embedding job). Keep returning to that "clean split of blame" — it's the spine that makes the before/after honest and sets up the next lesson.

---

## Slide 1 — Title
**Opening line:** "101 gave us a pipeline that runs end-to-end but retrieves badly. Today we fix the first stage — and find out that *what a chunk is* turns out to be the whole game."
**Talking points:**
- This is a build-along lesson: we reason out the design, then Claude Code builds it from a HANDOFF.
- Frame the payoff up front: by the end, the goblin query's top hit is clean — but its neighbors are still wrong, and that's intentional.

## Slide 2 — Ingestion is first, and errors here cascade furthest
**Opening line:** "Remember the cascade from 101? Ingestion sits at the top of it."
**Talking points:**
- The 101 crude ingest used fixed-size windows; on the "G" page a single window straddled the end of Githyanki and the start of Goblin.
- A straddling chunk poisons two things at once: the embedding (mixed topics) and the citation (which monster is this?).
- "Upstream error" is the key phrase — you can't prompt your way out of a bad chunk.
**If asked — "why not just fix it in retrieval?":** Retrieval can only rank what ingestion produced. If the unit is wrong, the best you can do downstream is rank a bad unit highly.

## Slide 3 — "What is a chunk?" is precision ↔ completeness
**Opening line:** "Every chunking decision is this one tradeoff in disguise."
**Talking points:**
- Tiny chunks: each is sharp and on-topic, but a full answer gets scattered across many — retrieval has to find all the pieces.
- Huge chunks: the whole answer is in one place, but it's buried in noise, and precision tanks.
- The target is the **smallest unit that still holds a whole answer**. For a monster, that's the monster's section.
**If asked — "isn't this just chunk size again?":** No — size is a *symptom*. The real variable is the *boundary*: where you cut. Size falls out of choosing good boundaries.

## Slide 4 — Three strategies
**Opening line:** "There are three families; we picked the cheap one that happens to fit this corpus perfectly."
**Talking points:**
- Fixed-size: simplest and cheapest, meaning-blind — what 101 used and what burned us.
- Structure-aware: split on the document's own headings; deterministic, cheap, and the heading doubles as a citation. Our choice.
- Semantic (hover the ? badge): a model finds topic shifts; best recall in benchmarks but must embed every sentence at ingest — expensive.
- The punchline: because DDB pages are rigidly templated, *structure already encodes semantics*, so structure-aware gets most of semantic's benefit at fixed's cost.
**If asked — "would semantic chunking beat ours here?":** Maybe marginally on recall, but at much higher ingest cost, and we'd lose the free citations. We'd only revisit it if 107's eval shows a real gap.

## Slide 5 — Evidence vs folk wisdom
**Opening line:** "Here's where we stay honest about what the research actually supports."
**Talking points:**
- Verified (directionally): semantic chunking out-recalls fixed splitting (Chroma ~0.91 vs ~0.85) — but it's a single vendor benchmark, so not portable.
- Killed: "optimal chunk size is 200–500 tokens" and "512 tokens / 10–20% overlap" — repeated everywhere, backed by no controlled benchmark.
- So we refuse to pick a magic number. We pick a **boundary rule** (the heading) and treat size as a tunable guard (107).
**If asked — "so chunk size doesn't matter?":** It matters, but it's corpus-specific. The mistake is importing someone else's number; the fix is measuring on your own data.

## Slide 6 — The rule we built
**Opening line:** "Here's the actual rule, in three parts."
**Talking points:**
- One chunk = one leaf heading section (one monster), boundaries from the DOM hierarchy.
- Size is a *guard*: oversized → sub-split recursively under a generous max; trivially tiny → merge into parent. Numbers are guards to tune in 107, not constants.
- Atomic blocks (stat blocks) are never cut, even if the guard fires nearby.
- Result: 49 sections → 48 clean chunks; one per monster plus "group overview" chunks where a heading carries its own lore.
**If asked — "what's a group-overview chunk?":** Headings like *Goblins* have intro/lore prose before the individual statblocks. That intro becomes its own coherent chunk — and it's the one that actually answered the goblin-environment query.

## Slide 7 — Metadata sidecar
**Opening line:** "The best part: structure-aware chunking gives us metadata for free."
**Talking points:**
- We populate the `meta` JSON bag the 101 schema already reserved — no migration.
- Fields: `source`, `breadcrumbs[]`, `chunkId`, `kind`.
- Breadcrumbs do double duty: the joined trail is the human citation *and* a future filter key for hybrid retrieval (104).
- Deferred on purpose: typed entity fields and a normalized monster DB — non-breaking to add later. Baselines first.
**If asked — "why JSON-encode the breadcrumbs array?":** `meta` is `Record<string,string>` (the durable 101 contract), so an array gets serialized. The display string also lives in the chunk's `section` field, which is what citations render from.

## Slide 8 — Live build findings (the payoff of building the deck *after* the build)
**Opening line:** "Building it for real falsified two things we'd assumed — and both are great lessons."
**Talking points:**
- **No tables.** The spec said "keep tables whole," but DDB renders stat blocks as `<div class="…stat-block-background">` — there are *zero* `<table>` elements. A "don't split a table row" rule would have matched nothing and silently done nothing. Moral: "structure-aware" means *the page's* structure, which you must actually inspect.
- **The "idempotent re-ingest" myth.** sqlite-vec's `vec0` virtual table ignores `INSERT OR REPLACE`, so re-ingesting into a non-empty DB *crashed*. 101's claim only ever held against an empty DB — it was never re-run. Moral: an "idempotent" claim you never tested is just a hope. Fixed with DELETE-then-INSERT.
**If asked — "should the lesson author change 101?":** Yes — the POST_BUILD flagged correcting 101's false idempotency claim. It's a record fix, not a code change.

## Slide 9 — Before / after
**Opening line:** "Did it work? Yes — but be precise about *what* it fixed."
**Talking points:**
- Top hit is now a clean, goblin-only chunk with the lair/environment answer intact — no more straddling.
- But #2/#3 are Grimlock and Gith — unrelated monsters.
- The clean split of blame: straddling + citation pollution was a *chunking* artifact (fixed here); the wrong neighbors are an *embedding* artifact (still the dumb hashing embedder → 103).
- 102 improved top-hit *content quality*; it did not move neighbor *ranking*. That's the 103 motivator, set up honestly.
**If asked — "so MRR didn't improve?":** Right — first relevant was already near the top; the win was content cleanliness, not rank. 103 is where MRR moves (0.33 → ~1.0).

## Slide 10 — Bigger picture
**Opening line:** "Zoom out: why this stage punches above its weight."
**Talking points:**
- Chunk boundaries shape everything downstream — what's retrievable, what the reranker sees, what grounds the LLM, what a citation points at.
- No portable "best" size; set a boundary rule now, measure guard numbers on our corpus in 107.
- D&D's rigid structure makes this unusually clean — the page hands us boundaries and citations.

## Slide 11 — Takeaways
**Opening line:** "Five things to carry forward."
**Talking points:** walk the five bullets; linger on "inspect reality, don't assume" and "clean blame: 102 = content, 103 = ranking."

## Slide 12 — Next
**Opening line:** "Those wrong neighbors? That's 103."
**Talking points:** 103 swaps the dumb hashing embedder for a real one (local Ollama), and covers what an embedding really is, cosine over a unit sphere, and what a vector DB actually does.

---

## Glossary
- **Chunk** — a single unit of retrievable content; what gets embedded and stored.
- **Structure-aware chunking** — splitting on the document's own structure (headings/DOM) rather than a fixed token count.
- **Semantic chunking** — using a model to detect topic shifts and cut there; highest recall, highest ingest cost.
- **Stat block** — a monster's self-contained statistics box; on DDB a styled `<div>`, not a table. Treated as an atomic, indivisible block.
- **Breadcrumbs** — the ordered heading trail to a chunk (e.g. Monster Manual › G | Monsters › Goblins › Goblin); serves as citation and future filter key.
- **Group-overview chunk** — the lore/intro prose under a group heading (e.g. *Goblins*), captured as its own chunk separate from the individual monsters.
- **Idempotent re-ingest** — re-running ingest yields the same stored state; only true after the 102 `vec0` DELETE-then-INSERT fix (101's version crashed on a non-empty DB).
- **`meta` bag** — the `Record<string,string>` JSON sidecar on each chunk, reserved in 101 and populated in 102; holds arrays as JSON strings.
- **Clean split of blame** — distinguishing which failure belongs to which stage: chunking artifacts (102) vs embedding artifacts (103).

## Post-build

*(Return-leg residue backfilled 2026-07-07 from `POST_BUILD_HANDOFF.md` — the build predates this section being required in the guide.)*

Built, independently re-verified, and merged (`rag-102-ingest`): one clean chunk per monster (49 sections → 48 chunks), correct breadcrumb citations, deterministic `chunkId`s. The two findings the author acted on:

- **`store.ts` had to be touched despite the spec's freeze** — a real, pre-existing 101 bug: sqlite-vec's `vec0` table ignores `INSERT OR REPLACE`, so re-ingest into a non-empty DB crashed. Fix (DELETE-then-INSERT) was kept after re-verification (two consecutive re-ingests, stable ids/counts), and 101's idempotency claim was corrected.
- **"Keep tables whole" was factually wrong for this corpus** — DDB has zero `<table>` elements; stat blocks are `div.stat-block-background`. The lesson's rule was reframed to "treat the atomic stat-block *element* as indivisible" — a live demonstration that "structure-aware" means the page's actual structure, not the assumed one.
- Still-open thread carried forward: the heterogeneous non-monster-page check remained partial (corpus had only the "G" page); prose-only sections within the page served as proxy evidence.
