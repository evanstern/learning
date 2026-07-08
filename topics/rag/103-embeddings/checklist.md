# Understanding Checklist: 103 — Embeddings + Vector Store

> Lesson 103 of the RAG series. Build-along: concepts here, code in `topics/rag/build/`.
> Check items off only when understanding is demonstrated (own words / correct reasoning), not merely acknowledged.
> Motivator carried from 102: chunks are now clean, but the goblin query's *neighbors* are still mis-ranked (Grimlock/Gith at #2/#3). MRR ≈ 0.33. That mis-ranking is an **embedding** artifact — this lesson's job is to fix it.

## 1. The Problem — why embeddings at all
- [x] What does the HashingEmbedder (101 stub) actually do, and why does it mis-rank? (synonym blindness, stop-word pollution) — bag-of-words hashing into 256 buckets; keys on token identity, not meaning
- [x] What does it mean for text to be turned into a *vector*, and what is that vector supposed to capture? — fixed-length list of floats = a point in meaning space
- [x] Why is "nearby in vector space" supposed to mean "similar in meaning" — and how is that different from keyword overlap? — learned dims encode meaning; near = small geometric distance
- [x] What's the alternative we're rejecting, and why isn't lexical match enough on its own? (sets up 104 sparse/hybrid) — lexical/BM25 nails exact identifiers but is blind to paraphrase; mirror-image failure of semantic → 104 hybrid. (Distinguished from heavyweight domain routing, parked → 106.)

## 2. The Solution — real embeddings + a vector store
- [x] How does a learned embedding model differ from a hashing bag-of-words? (semantics from training, not token identity) — dims become abstract learned features so synonyms cluster; vs arbitrary hash buckets
- [x] What is `dim` (dimensionality) and why does changing it force a full re-ingest? — (1) mechanical: distance is component-wise, 768 vs 256 has no valid pairing + sqlite-vec column is fixed-width; (2) semantic: different models = unrelated coordinate systems, never mixable. Fix = re-embed whole corpus. dim is one-way per DB.
- [x] Cosine vs L2/dot — what does the similarity metric measure, and why does normalization matter? — cosine = angle (direction/meaning), ignores magnitude; raw L2 penalizes long chunks for big-magnitude vectors. Normalizing to length 1 puts all vectors on the unit sphere → cosine & L2 then rank identically. Cosine = safe default.
- [x] What does a vector DB actually *do* — and what is ANN (approximate nearest neighbor)? The exact-vs-approximate tradeoff (recall vs latency). — brute force = O(N) exact; ANN (HNSW graph / IVF clusters) prebuilt at ingest, checks small neighborhood → fast but may miss true nearest. Acceptable because over-fetch top-K + rerank (105) = forgiving funnel. ANN index ≠ our `meta` sidecar (store-internal plumbing).
- [x] sqlite-vec specifically: brute-force scan vs ANN index — what is it doing at our corpus size, and when would that stop being fine? — sqlite-vec does brute-force EXACT KNN (no HNSW/IVF), snappy into ~hundreds of thousands. Right call for us: exact, no tuning, simpler. ANN only earns keep at large N + tight latency. `Store` is interfaced → swappable later. (ANN index ≈ relational column index = store-internal data.)
- [x] Local model via Ollama: what we gain (privacy, no per-call cost, repeatable) vs lose (quality ceiling vs hosted, ops). — gain: $ (no per-call fees), privacy/data-control (DDB copyright + Neumo rule), repeatability (pinned model → stable vectors; hosted deprecation would force re-ingest). give up: quality ceiling (hosted models out-rank small local ones), speed, ops burden. Local wins at our scale; benchmark hosted before prod.

## 3. The Bigger Picture
- [x] Why does this lesson fix *ranking* but not the lexical/identifier gap? (clean handoff of blame → 104 hybrid) — 102 fixed chunk content; 103 fixes ranking of semantic neighbors; 104 fixes exact-identifier gap (semantic dilutes exact names like "Tasha's Hideous Laughter"). Each lesson owns one failure class.
- [x] How does the dim/re-ingest constraint ripple through the rest of the pipeline (store schema, idempotency)? — fixed-width store column set at first ingest; dim change = wipe + re-ingest; ties to 102's DB-wipe note.
- [x] What does "embeddings are a frozen snapshot of a model" mean for maintenance (model swaps, versioning, drift)? — vectors are a DERIVED CACHE of (chunks + model version), not source data. Model upgrade = invalidate + re-derive whole cache (no migration path). Cost: backup, re-embed (time/$), citation/session breakage. Downtime fix = blue-green (build new DB, atomic swap). Guardrail: vector store must be disposable/rebuildable from source.
- [x] Where embeddings genuinely fail even when working perfectly — the motivation that doesn't go away. — exact identifiers diluted by query meaning (→104 hybrid); out-of-corpus queries → must abstain/graceful-fail (→106 generation / 108 hardening, Barnett "missing content").

## Applied (build-along — this increment)
- [x] Reasoned out the build increment before specifying it (Socratic gate held)
- [x] `HANDOFF.md` written: swap HashingEmbedder → Ollama embedder behind the `Embedder` interface; handle dim change + re-ingest; verify goblin query reranks (MRR → ~1.0)
- [x] `build/STATE.md` updated
- [x] **Built + verified by `/build-me`** (see `POST_BUILD_HANDOFF.md`): OllamaEmbedder (nomic-embed-text, 768-dim, L2-normalized) live; **MRR 0.33 → 1.0**, Goblins #1 (0.586), Grimlock/Gith gone from top 12; idempotent re-ingest holds at 768-dim; runs with/without API key.
- [x] **Return leg:** POST_BUILD read; `store.init()` dim-guard + softened "#2" wording folded back into `HANDOFF.md`; surviving Deep Gnome/Giants intruders captured as the 104 hybrid "before."
