# Raw Notes: 103 — Embeddings + Vector Store

> Running notes / build log captured during the session — decisions + the *why*, tidbits, tangents, questions for later.
> Carried in from 102: clean chunks, but neighbors mis-ranked (the 103 motivator). Fixed demo query:
> `"what kind of environment do goblins like to make their home in?"` — dumb embedder ranks goblin chunks 3rd & 5th; target after real embeddings is #1 & #2. Baseline MRR ≈ 0.33 → target ~1.0.

## Tidbits / things to remember
- **MRR** = mean reciprocal rank. Per query: 1/(rank of *first* relevant result); other relevant hits ignored. Then mean across queries. (MAP is the metric that rewards finding *all* relevant.) Goblin query: first relevant at rank 3 → 0.33; target rank 1 → 1.0.
- **Embedding = a vector** (fixed-length list of floats), NOT a string. Length = `dim`.
- **A "dimension"** = one slot in the vector. Hashing: slot = arbitrary word-bucket (no meaning). Learned: slot = abstract trained feature (collectively = meaning).
- Bigger dumb embedder (256→4096 buckets) doesn't help and can hurt synonyms — capacity ≠ comprehension. The win is *meaningful* axes, not more axes.
- HashingEmbedder's two blind spots: **synonym blindness** (home/lair/den = different buckets) + **stop-word pollution** (shared boilerplate pulls unrelated chunks together → Grimlock drifts near goblin).

## Decisions + why (build log)
- Two distinct levers separated in discussion: (1) **lexical/BM25** sparse retrieval = cheap exact-token match, no domain knowledge needed (→ 104 hybrid); (2) **domain-aware structured routing** (know "Goblin Boss"=monster → route to source → slice stat block) = heavyweight wiki-router direction, PARKED (→ 106 / future structured-retrieval lesson). Don't conflate; most exact-match win comes from plain BM25.
- Semantic vs lexical failures are mirror images (paraphrase vs exact-identifier) → that complementarity is the whole argument for hybrid in 104.

## Build results (from POST_BUILD_HANDOFF.md — verified live)
- **MRR 0.33 → 1.0** on the demo query. Top-12: `1. Goblins 0.586` (clearly ahead), `2. Deep Gnome 0.536` (intruder), `3. Goblin Boss`, `4. Goblin`, then a Giants cluster. **Grimlock & Gith fell out of the top 12** — real embeddings fixed the neighbors, exactly as predicted.
- **Scores are compressed (0.52–0.59)** on this homogeneous 48-monster corpus — ordering carries the signal, not the gaps. Great live "why normalize / why cosine" illustration: magnitude isn't doing the work, direction is.
- **Surviving intruders are semantically honest** (Deep Gnome, Giants all "live underground") — the synonym win working, not a bug. It's the *lexical/identifier* gap → the concrete **104 hybrid** "before."
- **Embedding cost baseline:** ~10s for 48 chunks in one batched `/api/embed` call (~200ms/chunk, CPU Docker Ollama); query embed sub-second. Feeds 107.
- **Dim-change crash hit live + fixed:** stale 256-dim DB + `CREATE TABLE IF NOT EXISTS` silently keeps old dim → 768 insert died mid-transaction. Return-leg fix: `store.init()` reads existing dim from `sqlite_master` and throws a clear "wipe + re-ingest" error (fail-loud, NOT auto-wipe). Folded into HANDOFF §5.
- **Endpoint:** `/api/embed` (plural, `input` array, `{embeddings}`) — NOT legacy singular `/api/embeddings`. Task prefixes confirmed unnecessary (bare model cleared the AC); deferred to 107.

## Tangents worth revisiting
- **Normalization to unit length** (Evan's aha): divide a vector by its magnitude ‖v‖=√Σx² → length 1, same direction. All unit vectors sit on the unit circle/sphere. E.g. [3,4]→/5→[0.6,0.8]. Once normalized, cosine and L2 give identical rankings.
- Cosine = compare angle only; raw L2 gets fooled by magnitude (long on-topic chunk ranked too low). Why cosine is the text-retrieval default.

## War stories
- Evan: spun up a hosted vector DB on Google Cloud to try the-stacks → **$500 overnight** before noticing. Lesson burned in: self-host at small scale + always set hard spending limits on cloud. (Reinforces the local-Ollama cost argument viscerally.)

## Open questions
