# Presenter's Guide — RAG 103: Embeddings + the vector store

Companion to `deck.html`. Per-slide: an **opening line** (say this), **talking points**, **if asked**, and a **glossary** at the end. Built in the post-build return leg, so it folds in the live result (slides 9–10).

> **Through-line:** 103 owns *ranking of semantically-related neighbors*. It fixes the wrong-monster neighbors 102 left behind (MRR 0.33 → 1.0) — but deliberately does **not** fix the exact-identifier gap (that's 104). Keep the "clean split of blame" spine: 102 = chunk content, 103 = neighbor ranking, 104 = lexical/identifier.

---

## Slide 1 — Title
**Opening line:** "Last lesson left a clean chunk at #1 but garbage at #2 and #3. Today we find out why — and fix it."
**Talking points:** 103 is where the dumb embedder finally gets replaced; the payoff is measured, not asserted.

## Slide 2 — The motivator
**Opening line:** "Here's exactly where 102 left us, and why it's not a chunking problem anymore."
**Talking points:**
- The top hit is clean (102's win). The neighbors at #2/#3 are unrelated monsters — a *ranking* failure.
- Culprit: `HashingEmbedder`, bag-of-words into 256 buckets, keys on token identity.
- Two blind spots: synonym blindness (home/lair/den = different buckets) and stop-word pollution (shared boilerplate pulls unrelated chunks together).
**If asked — "why not just make the hash bigger?":** More buckets is capacity, not comprehension — it can even push synonyms *further* apart. The fix is meaningful axes, not more axes.

## Slide 3 — What an embedding is
**Opening line:** "The one idea everything else hangs on: an embedding is a list of numbers — a point in space."
**Talking points:**
- Text → model → a fixed-length vector of floats (length = `dim`, 768 for our model). Not a string, not a hash.
- The *same* model embeds the query and every chunk; "retrieve" = find the nearest points.
- Near in space ⇒ near in meaning — but only if the model actually learned meaning (slide 4).
**If asked — "what do the individual numbers mean?":** Individually, not much you can name; collectively the coordinates encode meaning. See the next slide.

## Slide 4 — Hashing vs learned dimensions
**Opening line:** "Here's the difference between our dumb embedder and a real one, in one word: *meaning*."
**Talking points:**
- Hashing: each dim is an arbitrary bucket; synonyms scatter; more buckets doesn't help.
- Learned: each dim is an abstract feature from training; synonyms land together; coordinates *are* meaning.
- 256 dumb dims → 768 learned dims: the jump is the meaning, not the count.

## Slide 5 — Cosine & the unit sphere
**Opening line:** "When we say 'nearest,' nearest by what? Not straight-line distance — angle."
**Talking points:**
- Raw L2 (hover the ?) is fooled by length: a long, wordy on-topic chunk has a big-magnitude vector and looks "far."
- Cosine measures the angle, ignoring magnitude. Normalize every vector to length 1 (divide by its own length) → all sit on the unit sphere → L2 ranking == cosine ranking.
- So a chunk isn't penalized for being wordy; direction (meaning) decides.
- **Build tie-in (and slide 9):** our scores came out compressed (0.52–0.59) — that's the unit sphere at work on a homogeneous corpus; ordering carries the signal, not magnitude.
**If asked — "so why does sqlite-vec use L2 then?":** It ranks by L2, but because `OllamaEmbedder` L2-normalizes every vector, L2 ranking and cosine ranking are identical. The normalization is what makes that true — it's a required step, not optional.

## Slide 6 — Brute force vs ANN
**Opening line:** "What does a vector database actually *do* when a query arrives?"
**Talking points:**
- Brute force: compare to every vector, sort, top-K. Exact, but O(N) per query.
- ANN (hover the ?): prebuilt index (HNSW graph / IVF clusters) checks only a neighborhood. Fast, approximate — a recall/latency dial.
- Our choice: sqlite-vec is exact brute-force, no ANN. Right at our scale: exact, no tuning, simpler.
- Approximate is acceptable in RAG anyway — over-fetch top-K, let the 105 reranker trim. The `Store` interface stays swappable if we outgrow brute force.
**If asked — "when would we switch to ANN?":** Large N (hundreds of thousands+) *and* a tight latency budget. Measure p95 at your real N before deciding — don't guess.

## Slide 7 — Vectors are a derived cache
**Opening line:** "Here's a constraint that bites in production, and it bit us live."
**Talking points:**
- The store column is fixed-width `float[768]`. A 768-dim query can't be compared to 256-dim stored vectors — distance is component-wise, and different models have unrelated coordinate systems regardless.
- So `dim` is one-way per DB. Vectors are a *derived cache* of (corpus + model version); upgrading the model means invalidate + re-derive from source. No migration.
- **Live finding:** a leftover 256-dim DB + `CREATE TABLE IF NOT EXISTS` silently kept the old dim, and the 768-dim insert died with an opaque mid-transaction error.
- **Fix:** `store.init()` now reads the existing dim and throws a clear "wipe + re-ingest" message up front — deliberately *not* an auto-wipe (never silently delete the user's data).
**If asked — "why not auto-wipe?":** Silently deleting someone's database is a terrible default. Fail loud with the one-line fix; let the human pull the trigger.

## Slide 8 — Local via Ollama
**Opening line:** "We run the model on our own machine. Here's the trade."
**Talking points:**
- Gain: cost (no per-call fees — recall the $500 cloud-overnight story), privacy/data-control (DDB copyright + Neumo rule), repeatability (pinned model = stable vectors; a deprecated hosted model would force a re-ingest).
- Give up: quality ceiling (top hosted models out-rank small local ones) and ops burden.
- At our scale local wins easily; at quality-critical prod scale, benchmark a hosted model before committing.

## Slide 9 — The payoff (live)
**Opening line:** "Did it work? Yes — and here's the measurement, not a promise."
**Talking points:**
- Same query, same chunks, same store — only the embedder body changed. Goblins jumped 3 → 1; Grimlock and Gith fell out of the top 12. MRR 0.33 → 1.0.
- Scores compressed to 0.52–0.59: a homogeneous monster corpus on the unit sphere. Ordering is the signal, not the gaps — the live "why normalize / why cosine" beat.
**If asked — "MRR is 1.0 but #2 is wrong — isn't that contradictory?":** MRR only cares about the *first* relevant result's rank. First relevant is #1, so MRR = 1.0. The wrong #2 is a separate concern — and it's the next slide.

## Slide 10 — The surviving intruder → 104
**Opening line:** "Look at #2 — and notice it's not actually a mistake."
**Talking points:**
- Deep Gnome and the Giants cluster all live underground; a *habitat* query genuinely resembles them. That's the synonym win working.
- But the literal token *goblin* would pull goblin chunks decisively — meaning-similarity can't out-rank an exact identifier alone.
- That's the lexical/identifier gap: the concrete, observed motivation for 104 hybrid (dense + BM25, fused). These exact ranks are 104's "before."

## Slide 11 — Takeaways
**Opening line:** "Five things to carry forward."
**Talking points:** walk the five; linger on "normalize then cosine" and "vectors are a derived cache."

## Slide 12 — Next
**Opening line:** "Dense fixed the neighbors. Now we add the thing dense is bad at."
**Talking points:** 104 adds sparse/BM25 alongside dense and fuses with RRF; the Deep Gnome intruder is the motivating "before."

---

## Glossary
- **Embedding** — a fixed-length vector of floats representing text as a point in "meaning space."
- **Dimension (`dim`)** — one slot in the vector; the vector's length. 256 (hashing) → 768 (`nomic-embed-text`). One-way per DB.
- **HashingEmbedder** — the 101 stub: bag-of-words hashed into buckets; no semantics. Keys on token identity.
- **Cosine similarity** — similarity as the angle between two vectors; ignores magnitude.
- **L2 (Euclidean) distance** — straight-line gap between vector tips; sensitive to magnitude. Equals cosine ranking *after* normalization.
- **Normalize (to unit length)** — scale a vector to length 1 (÷ its own magnitude); puts all vectors on the unit sphere.
- **Vector store** — a DB that answers "give me the top-K nearest vectors." Here, sqlite-vec.
- **Brute-force / exact KNN** — compare the query to every stored vector; exact, O(N). What sqlite-vec does.
- **ANN (Approximate Nearest Neighbor)** — prebuilt index (HNSW/IVF) that checks a neighborhood; fast but approximate — a recall/latency dial.
- **Ollama** — local model server (here at `localhost:11434`) running `nomic-embed-text`.
- **Derived cache** — vectors are a function of (corpus + model version), fully rebuildable from source; never the source of truth.
- **MRR (Mean Reciprocal Rank)** — per query, 1/(rank of first relevant); averaged across queries. 0.33 (rank 3) → 1.0 (rank 1) here.

## Post-build

*(Return-leg residue backfilled 2026-07-07 from `POST_BUILD_HANDOFF.md` — the build predates this section being required in the guide.)*

Spec built as written; the headline payoff verified live: **MRR 0.33 → 1.0** on the goblin query, Goblins #1 (0.586, clearly separated from the 0.52–0.54 pack), Grimlock/Gith gone from the top 12. Return-leg outcomes:

- **Author-approved deviation folded in:** a `store.init()` dimension guard — reads the existing `vec_chunks` dim from `sqlite_master` and fails loudly with a "wipe + re-ingest" message on mismatch (deliberately not auto-wipe). This was hit live: a stale 102 `float[256]` DB + `CREATE TABLE IF NOT EXISTS` silently kept the old dim and killed the 768-dim insert mid-transaction.
- **Task prefixes not needed** — the bare `nomic-embed-text` model cleared the acceptance bar; prefixing deferred to 107 as a tuning knob.
- **Teaching beats extracted:** compressed scores (0.52–0.59) on a homogeneous corpus show ordering, not gaps, carries the signal (the "why normalize" slide); the surviving intruders (Deep Gnome #2, the Giants cluster) are semantically honest underground-dwellers — the lexical/identifier gap that is 104's concrete "before."
- **Cost baseline for 107:** ~10 s to embed 48 chunks batched (~200 ms/chunk), CPU-only Docker Ollama.
