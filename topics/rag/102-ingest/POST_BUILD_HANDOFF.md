# POST_BUILD_HANDOFF — Lesson 102: Ingestion done right (structure-aware chunking + metadata)

> Audience: the teaching/planning session that wrote `102-ingest/HANDOFF.md` (and its author).
> What was actually built, where it diverged, what I saw at runtime, and what should feed forward.
> Build tool: Claude Code via `/build-me`. Source of truth: `topics/rag/build/STATE.md` (updated).

## TL;DR for the author
The spec was sound and the design maps cleanly onto the real DOM — structure-aware chunking now yields **one clean chunk per monster** with correct breadcrumb citations. Built and verified end-to-end, with and without an API key.

**Two things you should act on:**
1. **I had to touch `store.ts` (which the spec said NOT to touch)** to fix a real, pre-existing bug: in-place re-ingest *crashed*. The 101 "idempotent re-ingest" claim was false — it only ever worked against an empty DB. AC #2 ("chunkId stable across re-ingest") is unsatisfiable without this fix. Minimal fix applied; **decide whether to keep it** (I recommend yes) and correct the 101 idempotency claim.
2. **The "keep tables whole" framing is factually wrong for this corpus** — there are **zero `<table>` elements**. DDB stat blocks are `<div class="…stat-block-background">`. The lesson should teach "keep the atomic stat-block *element* whole," not "don't split a table mid-row." This matters because it's a teach-me build: the current framing would teach a mechanism that doesn't exist on the page.

---

## Independent re-verification (2026-06-24) — build accepted, committed, merged
A second pass re-ran every acceptance check against the committed code (not the build session's notes):

- **Typecheck** `tsc --noEmit` → clean.
- **AC #1 / #2 / #4** re-confirmed green: 48 chunks, `chunks`=`vec_chunks`=48, Goblin / Goblin Boss are separate intact stat-block chunks, breadcrumbs correct, goblin-query top hit is the clean `Goblins` overview cited `Monster Manual § G | Monsters › Goblins` (neighbor ranks still off — the dumb-embedder 103 motivator, as expected).
- **Idempotent re-ingest re-confirmed:** ingested fresh, then re-ingested **twice** with no crash and stable ids/counts.

**Decision on Deviation 1 (the `store.ts` fix): KEPT.** It's confirmed correct and necessary — without the `vec_chunks` DELETE-then-INSERT, re-ingest raises `UNIQUE constraint failed` (vec0 ignores `INSERT OR REPLACE`). The author should still **correct the 101 idempotency claim** (it was false pre-fix) — that record-fix is the only open author action from item 1.

**Still open / unchanged:** AC #5 (heterogeneous non-monster page) remains **partial** — corpus has only the "G" page; closing it needs a second page dropped in (see Suggestions). Item 2 (tables→divs lesson reframing) is a teaching correction for the author, not a code change.

Shipped on branch `lesson-102-ingest`, tagged `rag-102-ingest`, merged to `main`.

---

## What was built
Against the acceptance criteria:

- [x] **One chunk per monster, no straddling.** `Goblin` and `Goblin Boss` are separate, clean chunks; the Goblin stat block is intact in a single chunk. 49 sections → 48 chunks on the "G" page.
- [x] **`meta` has `source` + correct `breadcrumbs`; `chunkId` deterministic.** Goblin: `source="Monster Manual"`, `breadcrumbs=["Monster Manual","G | Monsters","Goblins","Goblin"]`.
- [x] **`chunkId` stable across re-ingest** — *now genuinely true* after the `store.ts` fix (was crashing; see Deviation 1).
- [x] **Oversized sub-split / tiny merge.** Merge verified on real data (49→48: one sub-threshold fragment folded in). Sub-split verified **synthetically** — no real section on the "G" page exceeds the 6000-char guard (largest is Genies at ~5.5k), so I exercised it with a constructed oversized section and confirmed the atomic stat block is never cut.
- [x] **Goblin query: clean per-monster top chunk + breadcrumb citation.** Top hit is the clean "Goblins" overview (lair/environment answer intact); citation reads `Monster Manual § G | Monsters › Goblins`. Rank still imperfect (Grimlock #2, Gith #3) — the dumb embedder, exactly the 103 motivator. Asserted cleanliness + citation, not rank, per spec.
- [~] **Heterogeneous (non-monster) page check — PARTIAL.** The corpus only contains the "G" monster page; I had no separate prose/rules page to ingest. **Proxy evidence:** the same code path produced clean prose-only chunks for the non-statblock sections *within* the page (`Giants` intro, `The Ordning`, `Golems` intro, `Gith` overview — all `kind=prose`), which demonstrates the chunker keys off the generic heading hierarchy, not anything monster-specific. A true second-page check is still outstanding — see Suggestions.
- [x] **Embeddings/retrieval/generation logic unchanged; runs end-to-end with and without an API key.** `embedder.ts`, `retrieve.ts`, `generate.ts`, `types.ts` untouched. (`store.ts` *was* touched — Deviation 1.)
- [x] **Learner comments throughout; deferred seams tagged; `README.md` + `STATE.md` updated.** Old `// DUMB (102)` markers removed and replaced with `GRADUATED (102)` notes.

## Deviations from the spec

### 1. Touched `store.ts` (spec said don't) — to fix a real re-ingest crash  ← **objection / decision needed**
- **Spec said:** "Do NOT touch … `src/retrieve.ts`, `src/generate.ts`, interfaces in `types.ts`" and treats Store as unchanged; AC #2 requires "`chunkId` is stable across re-ingest."
- **Shipped:** A 4-line fix to `SqliteVecStore.upsert`: for the `vec_chunks` vec0 virtual table, DELETE-then-INSERT instead of `INSERT OR REPLACE`.
- **Why:** sqlite-vec's `vec0` virtual table does **not** honor `INSERT OR REPLACE` on its primary key — re-inserting an existing id raises `UNIQUE constraint failed on vec_chunks primary key`. So re-ingesting into a non-empty DB **threw and rolled back**. The 101 code (and `STATE.md`) claim idempotent in-place re-ingest, but that only ever worked against an empty DB. Without this fix, AC #2 is literally unsatisfiable: you can't show "stable across re-ingest" when re-ingest crashes. The `chunks` table (a normal table) was fine; only the vector table needed the change.
- **Action for the author:**
  - Decide whether to keep the fix. **Recommend keeping it** — it's minimal, interface-preserving, and doesn't affect the 104 hybrid plan (104 adds `searchHybrid`, not new write semantics).
  - Correct the source: 101's `POST_BUILD_HANDOFF.md` / `STATE.md` claim "re-running ingest … is safe / idempotent" — that was false pre-fix. Either credit the fix to 102 or note it as a 101 bug found in 102.
  - If you'd rather Store stay frozen, the alternative is "re-ingest requires a DB wipe" — but then reword AC #2 and the 101 idempotency claim accordingly.

### 2. "Tables / stat blocks kept whole" — there are **no tables**  ← **lesson correction**
- **Spec said:** "Tables / stat blocks kept whole — never split a table mid-row."
- **Shipped:** Stat blocks are detected by the `stat-block-background` CSS class on a `<div>` and flagged `atomic`; the sub-splitter never cuts inside an atomic block.
- **Why:** The "G" page contains **0 `<table>` elements**. A DDB stat block is a single self-contained `<div class="Basic-Text-Frame stat-block-background">`. A literal "don't split a table row" rule would match nothing and silently do nothing.
- **Action for the author:** Reframe the lesson's chunking rule as "treat the atomic stat-block *element* as indivisible," and mention that DDB renders stat blocks as styled divs, not HTML tables. (Good teaching moment: "structure-aware" means *the page's* structure, which you have to actually inspect — not the structure you assumed.)

### 3. Breadcrumbs live in **two** places, by design
- **Spec said:** Populate `meta.breadcrumbs` (an ordered array) and noted AC #4 "the citation shows the breadcrumb trail."
- **Shipped:** `meta.breadcrumbs` holds the structured array **JSON-encoded** (because `ChunkRecord.meta` is `Record<string,string>` — the durable 101 contract — so an array must be serialized). Separately, the chunk's existing `section` field carries the human-readable trail (`"G | Monsters › Goblins › Goblin"`).
- **Why:** Citations are rendered by `generate.ts`/`cli.ts` from `chunk.section` — and the spec said not to touch those. Putting the joined trail in `section` is what makes AC #4 ("citation shows the trail") true *without* changing the generate/types contracts. The JSON array in `meta` is the future filter key (104+).
- **Action:** None required — just know the trail is intentionally dual-homed (display string in `section`, structured array in `meta.breadcrumbs`).

### 4. Branch headings also produce a "group overview" chunk (expected, flagging for clarity)
- The "G" page's group headings (`Goblins`, `Giants`, `Genies`, `Gith`, `Ghouls`, `Gnolls`, `Golems`, `Gricks`) carry their own intro/lore prose *before* their sub-monsters. Each such heading therefore yields a clean **group-overview chunk** in addition to one chunk per child monster.
- So the page yields **one chunk per monster PLUS ~8 group-overview chunks**. This is correct and desirable (the overview is a coherent semantic unit — and it's the chunk that actually answered the goblin-environment query). Flagging only so "one chunk per monster" isn't misread as "exactly N monster chunks and nothing else."

### 5. Small delegated judgment calls (spec said "pick a generous default" / "simplest thing")
- `MAX_CHARS = 6000` (~1500 tokens) sub-split guard; `MIN_CHARS = 120` tiny-merge guard. Commented as guards to tune in 107, not magic numbers.
- `source` derived heuristically from the DDB filename (2nd `" - "`-delimited segment, year stripped → "Monster Manual"); falls back to filename-without-extension. Commented as a heuristic.

## Runtime observations
- **Chunking vs. embedding noise (the feed-forward question):** 102 fixed the *content* of the top result but not the *ranking* of its neighbors. Before (101): goblin content ranked 3rd & 5th and chunks straddled monster boundaries. After (102): the clean "Goblins" overview ranks **#1** with the lair/environment answer intact in one unit — but #2 and #3 are unrelated monsters (`Grimlock`, `Gith`). **Conclusion: the straddling/citation pollution was a chunking artifact (now fixed); the mis-ranking of neighbors is an embedding artifact (still there, the 103 job).** Clean split of blame.
- **Live LLM path** (with key) answered correctly and grounded: *"goblins lair in caves, abandoned mines, despoiled dungeons … shun sunlight and sleep underground,"* citing `[1] Monster Manual § G | Monsters › Goblins`.
- **Two chrome chunks leaked** despite scoping to `.p-article-content`: a `(intro)` jump-nav table-of-contents ("Jump to…Galeb Duhr…") and a `G | Monsters` "Details, lore, and statistics…" subtitle. Both are tiny and low-impact, but they're noise — see Suggestions.
- Sub-split never fired on real data (largest section ~5.5k < 6k guard); only the merge guard fired once (49→48).

## Suggestions feeding forward
- **For the 102 lesson:** lead with the two corrections above (tables→divs; the re-ingest bug). Both are excellent teaching beats: "inspect the real DOM, don't assume" and "an 'idempotent' claim you never re-ran is a claim you haven't tested."
- **Heterogeneous corpus:** add one non-monster DDB page (a rules/prose chapter) to `corpus/` and re-run, to fully close AC #5. The code is general (proven on in-page prose sections) but a second page shape would confirm it and feed the lesson's edge-case list.
- **Chrome filtering (small, optional):** the jump-nav TOC and the "Details, lore, and statistics" subtitle leak as chunks. A cheap filter (drop sections whose only content is a nav list, or whose body is below a tiny threshold and contains no real prose) would clean these. Left out for now to avoid over-fitting to one page's chrome — flagging for the lesson's edge-case list (spec §7).
- **103 (embeddings):** the before/after story is set up. Fixed demo query `"what kind of environment do goblins like to make their home in?"` → today the clean Goblins chunk is #1 by luck of lexical overlap, but neighbors are wrong; real embeddings should pull the *Goblin*/*Goblin Boss* stat chunks and suppress Grimlock/Gith. STATE's MRR≈0.33 baseline still stands for ranking; 102 improved top-hit *content quality*, not MRR.

## Environment / setup notes
- **No new dependencies.** `node-html-parser` was already in `package.json` (used by the old tag-strip). TypeScript strict build passes (`tsc --noEmit`, exit 0).
- **101 → 102 transition still wants a one-time DB wipe.** Even with the re-ingest fix, 101 produced ~hundreds of fixed-window chunks with different ids; `upsert` only replaces ids in the *new* set, so old 101 ids would linger as orphans. Wipe `stacks.db` once when moving 101→102 (`./scripts/teardown.sh` or `rm stacks.db`), then ingest. *After* that, 102 re-ingest is cleanly idempotent in place (verified: 48 chunks, 48 vectors, identical ids across runs, no crash).
- Verified both generation paths: real `ANTHROPIC_API_KEY` present in `build/.env` (live path), and forced-empty key (degraded path returns retrieved context). Both work.
- Node 24.17.0 (Volta-pinned). better-sqlite3 + sqlite-vec load fine.
