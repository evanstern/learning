# POST_BUILD_HANDOFF — Lesson 103: Real embeddings (Ollama) + vector store

> Audience: the teaching/planning session that wrote `HANDOFF.md` (and its author).
> What was actually built, where it diverged, what was observed live, and what feeds forward.
> TL;DR: **spec was sound and built as written; the headline payoff is verified live — MRR 0.33 → 1.0, Grimlock/Gith gone.** One authorized deviation added in the return leg (a `store.init()` dimension guard — see below). Two findings worth folding into the deck (the dim-guard story, and a "still-imperfect neighbors" teaching moment that motivates 104).

## What was built
Against the §8 acceptance criteria — all met:

- [x] **`OllamaEmbedder implements Embedder`** in `src/embedder.ts`: `dim === 768`, `embed()` batches via `POST {OLLAMA_URL}/api/embed` with `{model:"nomic-embed-text", input: texts}` → `{embeddings}`, returns one **L2-normalized** vector per input **in order**, **fails loudly** on both unreachable-server (fetch throws) and model-not-pulled (HTTP 404) with fix-it messages. Uses global `fetch` (Node 24) — no new npm dep. Shared `l2normalize` extracted and reused by both embedders.
- [x] **`cli.ts`** wires `OllamaEmbedder` as the default (`HashingEmbedder` retained as a commented fallback); `store` built with `embedder.dim` → vec0 table is `float[768]` after a fresh ingest (verified).
- [x] **Bootstrap** brings Ollama up (docker-compose profile gate removed), waits for readiness, and pulls `nomic-embed-text` (`docker compose exec -T ollama ollama pull …`). Model downloaded (~274 MB) and ingest succeeded from a wiped DB.
- [x] **The payoff** (see Runtime observations): goblin query ranks **Goblins #1**; **Grimlock and Gith absent from the top 12**; **MRR = 1.0** (up from 0.33).
- [x] **Idempotent re-ingest**: second ingest → same 48 chunks, `chunks: 48 / vec_chunks: 48`, no vec0 crash (the 102 DELETE-then-INSERT fix holds at 768-dim).
- [x] **`store.ts`** "ANN/approximate" docstring corrected to **exact brute-force KNN**; no ANN index added (the only `store.ts` edit, per §5).
- [x] **Degraded generation** verified: with `.env` moved aside, query prints "ANTHROPIC_API_KEY not set…" and returns raw retrieved context (goblin chunk #1). Generation path untouched.
- [x] **`tsc --noEmit` clean.** `// DUMB (103)` markers → `// GRADUATED (103)`; deferred seams tagged (`// DEFERRED (107 tuning): nomic task prefixes…`). `README.md`, `.env.example`, `docker-compose.yml`, `bootstrap.sh`, `STATE.md` updated.

## Deviations from the spec
One substantive (authorized) deviation, plus minor notes.

- **AUTHORIZED DEVIATION — `store.init()` dimension guard (return-leg addition).** §5 scoped `store.ts` to a docstring fix only. In the return leg the lesson author explicitly approved adding logic: `init()` now reads the existing `vec_chunks` table's declared dimension from `sqlite_master` and, if it disagrees with the current embedder's `dim`, **throws a clear "wipe + re-ingest" error before doing any work** — instead of letting the mismatch surface later as an opaque `SqliteError: Dimension mismatch … Expected 256 … received 768` thrown mid-transaction from inside `upsert()`. Deliberately **NOT auto-wipe** (silently deleting the user's DB is the wrong default); the message gives the one-line safe fix. Verified live: a simulated float[256] DB met by the 768-dim embedder throws the friendly error; the real float[768] DB inits with no false positive. **Action for the author:** fold this into the lesson source — it turns 103's headline rule ("changing model/dim ⇒ full re-ingest") from a README footnote into a code-enforced, fail-loud guard, which is a strong teaching beat alongside the OllamaEmbedder "fail loudly" path. Consider updating §5 of the HANDOFF so a future re-build keeps the guard.

- **§6 task prefixes — NOT needed.** Built the clean interface-preserving swap with **no** `search_document:`/`search_query:` prefixes, as recommended. The bare model cleared the AC comfortably (Goblins #1 at 0.586, clearly ahead). Tagged prefixing as a deferred 107 knob in code. *Action: none — the recommendation held.*
- **§8 "ideally #2" not literally met (not a failure).** AC asked for goblin chunks at "#1 (and ideally #2)". Result: **#1 Goblins ✅, #2 Deep Gnome (Svirfneblin) ✗, #3 Goblin Boss ✅, #4 Goblin ✅.** The first-relevant-at-#1 gives MRR = 1.0 (the actual target), and Grimlock/Gith are gone — so the AC's measurable bar is met. The "#2" wording is aspirational; the real story is "neighbors mostly cleaned up, one intruder remains." *Action: soften "#2" to "top of the list" in the lesson, and use the remaining intruder as the 104 hook (below).*
- **Verification used `rm stacks.db` not full `teardown.sh`.** `teardown.sh` also wipes `node_modules` (slow reinstall) and is irrelevant to the dim concern. I verified the dim-relevant path (`rm stacks.db` → `ingest` at float[768]) plus all of bootstrap's docker/pull/ingest steps. The canonical `teardown → bootstrap → ingest` is equivalent for 103's purposes. *Action: none.*

## Runtime observations
**The headline payoff, measured live** (full dense top-12, score = 1/(1+L2), query = `"what kind of environment do goblins live in?"`):

```
 1. 0.5859  Goblins                         ← clean goblin overview/lair chunk
 2. 0.5363  Deep Gnome (Svirfneblin)        ← intruder (underground-dweller)
 3. 0.5326  Goblins › Goblin Boss           ← goblin
 4. 0.5319  Goblins › Goblin                ← goblin
 5. 0.5313  Giants › Hill Giant
 6. 0.5286  Giants › Cloud Giant
 7. 0.5227  Giants › Stone Giant
 8. 0.5225  Giants › The Ordning
 9. 0.5212  Gargoyle
10. 0.5209  Ghouls › Ghoul
11. 0.5200  Gricks
12. 0.5200  Giants › Fire Giant
```

- **MRR 0.33 → 1.0** on the demo query (first relevant went rank 3 → rank 1). Goblins #1 is clearly separated (0.586 vs a 0.52–0.54 pack). **Grimlock and Gith — the 101/102 offenders — fell out of the top 12 entirely.** Prediction confirmed: real embeddings fixed the *neighbors*.
- **Scores are compressed (0.52–0.59).** Expected: a homogeneous corpus (48 monster stat-blocks, all sharing combat/stat boilerplate) on a normalized sphere → everything is somewhat close; the *ordering* is what carries the signal, not the absolute gaps. Good live illustration of why L2-on-unit-sphere == cosine ranking matters — magnitude isn't doing the work, direction is.
- **The remaining intruders are semantically honest.** Deep Gnome ("svirfneblin… deep underground"), and the Giants/Gargoyle/Ghoul cluster all carry cave/underground/lair semantics — exactly what a *habitat* query should pull. This is the synonym win working, not a bug.
- **Embedding latency (first real cost data point):** ingest of **48 chunks ≈ 10 s** of embedding wall-time (12 s total minus ~2 s tsx startup) in a single batched `/api/embed` call, CPU-only Docker Ollama on this Mac. Query-time embedding (1 string) is sub-second. So ~200 ms/chunk amortized in batch — fine at this scale, but a visible cost that motivates the 107 cost discussion and any future batching/caching.
- **The dim-change crash is real and reproducible** (see finding #1) — I hit it live on first `bootstrap.sh` run against a leftover 102 `float[256]` DB. It's the §4 prediction made concrete: `CREATE TABLE IF NOT EXISTS vec_chunks USING vec0(... float[256])` silently keeps the old dimension, and the 768-dim insert dies with `SqliteError: Dimension mismatch … Expected 256 … received 768`.

## Suggestions feeding forward
- **(Finding #1 — RESOLVED in the return leg ✅)** `bootstrap.sh` runs `ingest` as its last step but does **not** wipe a stale DB first, so upgrading a 101/102 repo and running `bootstrap.sh` hit the raw `SqliteError` dim-mismatch (ugly, mid-transaction). **Decision (author-approved): option (c) — implemented a `store.init()` dim-mismatch guard** that fails loudly with a clear "wipe + re-ingest" message (NOT auto-wipe). See the Deviations section for details and verification. The README "wipe first" note stays as belt-and-suspenders. Net effect: a learner who forgets to wipe now gets an actionable one-paragraph error at startup instead of a stack trace from deep in `upsert()`. The author should reflect this guard back into the lesson source + HANDOFF §5.
- **(Deck material)** The before/after is a clean teaching arc: *same query, same chunks, same store — only the embedder body changed, and Grimlock/Gith vanished while Goblins jumped 3→1.* The compressed-score observation is a great slide for "why normalize / why cosine."
- **(104 hook — strong)** The surviving intruders (Deep Gnome #2, Giants cluster) are the **lexical/identifier gap** 104 is for: a habitat query semantically resembles every "lives underground" monster, but the literal token *goblin* would pull goblin chunks decisively. This is the concrete, observed motivation for hybrid (dense + BM25/sparse) fusion. Capture these exact ranks as 104's "before."
- **(107)** Use the ~200 ms/chunk batch latency as the baseline embedding-cost number.
- **102 chrome check:** no leaked "chrome" chunks (jump-nav TOC, subtitle) appeared anywhere in the top-12 — the 102 cleanup holds under real embeddings.

## Environment / setup notes
- **Docker required for the documented path.** This machine had neither Docker nor Ollama at build start; Docker was installed mid-build, then `bootstrap.sh` worked end-to-end (compose up → readiness wait → model pull → ingest). A native `ollama serve` on the host is an equally valid alternative (same `localhost:11434`), and `bootstrap.sh` prints that fallback when docker is absent.
- **Versions:** Node v24.17.0 (global `fetch` used, no `node-fetch` dep) · Docker 29.5.3 / Compose v5.1.4 · `ollama/ollama:latest` · `nomic-embed-text` (274 MB, 768-dim) · better-sqlite3 12 + sqlite-vec 0.1.9.
- **`/api/embed` is the right endpoint** (plural, `input` array, `{embeddings}` reply) — confirmed working. Do **not** use the legacy singular `/api/embeddings` (`prompt`/`embedding`); it embeds one string at a time.
- **Re-ingest is mandatory on any model/dim change** — vectors are a derived cache of (corpus + model); the source HTML in `corpus/` is the source of truth. `rm stacks.db && npx tsx src/cli.ts ingest` rebuilds.
- Model pull persists in the `ollama_data` named volume, so subsequent `docker compose up` does not re-download.
