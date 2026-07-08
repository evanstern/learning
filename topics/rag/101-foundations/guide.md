# RAG 101 — Presenter's Teaching Guide

Companion to `deck.html`. For each slide: an **opening line** (read it to get rolling), **talking points** (depth to riff on), and **if asked** (grounded answers to likely questions). **Glossary** at the end.

**How to run it:** advance with arrow keys / space; ⌘P → "Save as PDF" for a handout. Aim for ~30–40 min, technical audience. The deck reads solo, so don't just narrate it — add the color that isn't on the slide. The whole arc is grounded in an adversarially-verified research corpus (verified findings vs killed folk wisdom), so you can stand behind the claims.

---

## Slide 1 — Title

**Opening line:** "This is lesson one of an eight-part build-along: we learn RAG by rebuilding a real system — a D&D corpus search — one concept and one increment at a time. Today is the *why* and the *shape*."

**Talking points:**
- Set the frame: this is learn-first. We reason before we build; nothing is hand-waved.
- RAG = Retrieval-Augmented Generation. By 2025 the core patterns are mature enough to ship production systems — which is exactly why it's worth learning properly.

---

## Slide 2 — The one-liner

**Opening line:** "In one sentence: RAG grounds a model's answers in knowledge that lives *outside* its weights."

**Talking points:**
- The load-bearing word is **parametric**. A base model only knows what got compressed into its weights at training time.
- RAG flips that to **non-parametric** knowledge: external, swappable, private, citable. Every benefit downstream falls out of that one shift.

**If asked — "Isn't this just search + a prompt?"** Essentially yes, and that simplicity is a feature. The engineering is in making retrieval *good* — which is most of this course.

---

## Slide 3 — The problem

**Opening line:** "Why not just use the model's own knowledge? Because parametric knowledge fails three ways."

**Talking points:**
- **Frozen**: to update one fact you'd retrain. Errata, new sourcebooks, today's numbers — all invisible.
- **Lossy**: long-tail facts get smeared; the model gives a confident gist, wrong on specifics.
- **Unattributable**: it can't cite a source, so you can't verify or trust it.
- Stress: "fewer hallucinations" is a *tendency*. The model can still ignore its context — that's a documented failure mode we cover in 108.

**If asked — "Doesn't a bigger model fix this?"** It softens lossiness but never fixes frozen or unattributable. Scale doesn't make weights current or citable.

---

## Slide 4 — vs the alternatives

**Opening line:** "RAG isn't the only option. Here are the three real alternatives and when each actually wins."

**Talking points:**
- **Fine-tuning** changes *behavior* (tone, format, task), not facts. It re-bakes knowledge into weights (frozen again), can't cite, and is poor at long-tail recall. Use it to change *how* a model acts, not *what* it knows.
- **Long context** (stuff everything in) works until cost, latency, and attention degradation bite. Doesn't scale past what fits — or what you'll pay per call.
- **Tool/SQL** wins when the answer is a precise query over *structured* data. RAG is for *unstructured* text with fuzzy relevance.

**If asked — "Fine-tuning vs RAG — can I do both?"** Yes, they're orthogonal. Fine-tune for behavior/format, RAG for knowledge. Common in production.

---

## Slide 5 — The pipeline

**Opening line:** "Every RAG system is the same three stages — and each is really a *set of decisions*, not a fixed recipe."

**Talking points:**
- **Ingest**: parse → chunk → embed → store. Knobs: how you chunk, which embedder.
- **Retrieve**: filter → search → rerank. Knobs: dense vs sparse, top-k.
- **Generate**: assemble context → call the LLM. Knobs: prompt, citation format.
- The punchline: there's no universal best *recipe*, but the *shape* is settled. Build to the shape, tune the knobs empirically.

**If asked — "Where does the vector database fit?"** Inside ingest (store) and retrieve (search). We use sqlite-vec; lesson 103 covers what it's actually doing.

---

## Slide 6 — The cascade

**Opening line:** "Here's the single most important consequence of that pipeline: errors flow one direction."

**Talking points:**
- "You can't prompt your way to context that was never retrieved." Say it twice; it's the thesis.
- Two flavors: low precision (right chunk buried — recoverable) vs the right chunk never reaching the model (unrecoverable).
- This is *why build order = pipeline order*: we fix retrieval (102–105) before tuning any generation prompt.

**If asked — "So generation never matters?"** It matters — but it's the *last* place to optimize. Optimizing generation on top of broken retrieval is polishing a wrong answer.

---

## Slide 7 — Verified vs folk wisdom

**Opening line:** "RAG blog posts are full of confident numbers. Most of them don't survive scrutiny. Here's the line between what's real and what's folklore."

**Talking points:**
- Survived (with caveats): hybrid retrieval (domain-dependent!), cross-encoder reranking, the 7 failure points, separate retriever/generator eval.
- Killed: specific chunk sizes, overlap percentages, blanket "+X%" improvement claims — no controlled benchmark, corpus-dependent.
- The discipline: trust *architectural patterns*, distrust *magic numbers*, and re-verify domain-specific claims on your own data.

**If asked — "So I should never trust a chunk-size recommendation?"** Treat it as a starting point to measure, never a proven constant. Lesson 107 is how you find *your* number.

---

## Slide 8 — the-stacks on the map

**Opening line:** "Let's locate a real design decision on this map — the wiki router from the system we're rebuilding."

**Talking points:**
- v1 used a curated wiki as a "librarian" to scope retrieval. Two wirings, very different risk.
- **Pre-filter** (route then search): a wrong route makes the right answer *unreachable* — a hard, silent failure.
- **Post-filter** (retrieve then prune): the wiki can only *subtract* from what was already found — it can never hide the answer.
- The reflex worth teaching: make a risky component able to subtract, never to gate.

**If asked — "Is routing a good idea or not?"** That's exactly the open question we put on trial in lesson 106 — against plain hybrid + reranking. Don't pre-judge it.

---

## Slide 9 — A revealing corpus

**Opening line:** "Why D&D? Because it's a corpus engineered — by accident — to expose RAG's failure modes."

**Talking points:**
- **Standardized** structure (every monster the same template) → shared boilerplate makes stop-word pollution visible.
- **Varied** content under that structure → the spread that exposes weak retrieval.
- **Identifier-dense** (proper nouns, stat-block tables) → where dense embeddings are weakest and BM25 wins (104, and a verified research finding).

**If asked — "Would a corporate corpus behave the same?"** The same failure modes, just less *legible*. D&D makes them jump out, which is why it teaches well.

---

## Slide 10 — The live failure

**Opening line:** "We didn't assert any of this — the very first build showed it to us. Here's a real query against the dumb baseline."

**Talking points:**
- Walk the ranking: irrelevant monsters (Githyanki, Grimlocks, Stone Giants) outranked the actual goblin chunks.
- Two causes at once: synonym blindness (no semantics) and stop-word pollution (function words carry the vector).
- The LLM *still answered* from ranks 3 & 5 — but only because they were inside top-k. Shrink k or grow the corpus and the answer vanishes. Retrieval is the ceiling.
- This failure is deliberately preserved as the motivator for lesson 103 (real embeddings).

**If asked — "Why not just fix it now?"** Because the point is to *see* the problem before solving it — and to have a measurable before/after when 103 swaps in real embeddings (target: goblins at #1 and #2).

---

## Slide 11 — The build approach

**Opening line:** "How do we build something runnable in lesson one without faking it? A walking skeleton."

**Talking points:**
- Stable interfaces now (low-risk, because the shape is settled) + the dumbest *real* body behind each.
- Each lesson swaps an implementation; the interface never moves; nothing is throwaway.
- The deciding argument: 107's evaluation needs a runnable baseline from day one. A skeleton that runs makes the series measurable.
- Bonus: dumb implementations fail *visibly*, which motivates the next lesson.

**If asked — "Why not just define interfaces and stub the bodies?"** Then nothing runs until the end and you have no baseline to measure against. The runnable spine is the point.

---

## Slide 12 — Mental model

**Opening line:** "If you keep one slide, keep this one."

**Talking points:**
- Three ideas: knowledge lives outside the weights; errors flow downstream so fix retrieval first; the shape is settled but the numbers are yours to measure.
- Everything else in the course hangs off these.

---

## Slide 13 — Takeaways

**Opening line:** "Five things to walk out with."

**Talking points:**
- Use it as a recap checklist — ask the room to explain each back rather than reading it.

---

## Slide 14 — Up next

**Opening line:** "Next time: ingestion done right — what a chunk should actually *be*, and killing the goblin-boundary noise we just watched."

**Talking points:**
- Tease the v1 insight: store the HTML + per-page metadata so chunk boundaries come near-free.

---

## Glossary

- **Parametric / non-parametric knowledge** — knowledge baked into model weights vs. supplied externally at query time.
- **Chunk** — a unit of source text that gets embedded, retrieved, and cited.
- **Embedding** — a vector representation of text; similar meanings → nearby vectors (the goal; a dumb embedder fails at it).
- **Dense vs sparse retrieval** — semantic vector similarity vs. lexical token matching (BM25/SPLADE).
- **BM25** — the classic keyword-ranking algorithm behind most search engines: scores a document by exact query-term overlap, weighting rarer terms higher and normalizing for length. Strong on identifiers/codes, blind to meaning.
- **Hybrid retrieval** — combining dense + sparse (lesson 104).
- **Reranking** — a second, more accurate pass over top-K candidates (cross-encoder; lesson 105).
- **top-k** — how many chunks retrieval hands to the generator. Too small → relevant chunks fall off the edge.
- **Synonym blindness** — retrieval missing matches because query and source use different words for the same concept.
- **Stop-word pollution** — high-frequency function words dominating a vector, so unrelated text scores as similar.
- **The cascade** — retrieval errors can't be fixed downstream by generation.
- **Walking skeleton** — a full pipeline wired end-to-end with minimal real implementations, runnable from day one.
- **Pre-filter vs post-filter** — scoping retrieval *before* search (can hide the answer) vs *after* (can only remove junk).
- **Ragas** — the dominant RAG evaluation framework; measures retriever and generator separately (lesson 107).

## Post-build

*(Return-leg residue backfilled 2026-07-07 from `POST_BUILD_HANDOFF.md` — the build predates this section being required in the guide.)*

The walking skeleton shipped with all acceptance criteria met: end-to-end ingest → query → cited answer, degrading gracefully without an API key, every stage behind its interface. What the build sent back:

- **Dependency corrections folded into the spec record:** `better-sqlite3` ^11 → ^12 (v11's V8 APIs are gone in Node 24), `@anthropic-ai/sdk` ^0.39 → ^0.105 (old versions bundle `node-fetch`, which breaks mid-stream on Node 18+), `sqlite-vec` + `dotenv` added to the dependency list, Node pinned to LTS via Volta.
- **The dumb-embedder failure mode was observed live**, exactly as the lesson predicted: the goblin-habitat query ranked Githyanki and Grimlocks above Goblins (relevant chunk at rank 3 → MRR ≈ 0.33). That number became the series' baseline and the 103 motivator.
- **Correction recorded later:** the "idempotent re-ingest" claim made by this build was found false in 102 — vec0 ignores `INSERT OR REPLACE`, so re-ingest into a non-empty DB crashed until 102's DELETE-then-INSERT fix. Noted here so this guide doesn't overclaim.
