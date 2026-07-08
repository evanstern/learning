# POST_BUILD_HANDOFF — Lesson 101: Walking Skeleton

> **Audience:** future teaching sessions, future lesson handoffs, and the course author.
> This documents what was actually built, what diverged from the spec, what was observed at runtime, and what should feed forward into the lesson content or future lessons.
> *(Archived from the Claude Code build session that implemented the 101 handoff.)*

---

## What was built

The full 101 walking skeleton is live at `topics/rag/build/`. All acceptance criteria from the HANDOFF.md are met:

- `scripts/bootstrap.sh` brings the stack up, initializes the DB schema, and prints corpus-drop instructions.
- Ingest of a single HTML file (Monster Manual "G" page) produces chunks + vectors in sqlite-vec.
- `query` returns a grounded answer with citations end-to-end.
- Runs with and without `ANTHROPIC_API_KEY` (degrades, never crashes).
- Every stage sits behind its interface; all swap points are marked with lesson comments.
- `scripts/teardown.sh` removes DB/volumes/state cleanly.
- Corpus is git-ignored; no copyrighted HTML committed.
- Abundant learner-facing comments throughout; every dumb seam tagged with its future lesson.

---

## Deviations from the HANDOFF spec

### 1. `better-sqlite3` version bumped to v12
**Spec said:** `^11.0.0` · **Shipped:** `^12.11.1`
**Why:** `better-sqlite3` v11 uses V8 APIs removed in Node.js 24; the native build failed. v12 is a drop-in replacement (identical public API).
**Action:** update the HANDOFF spec to `^12.x`. No teaching content affected.

### 2. `sqlite-vec` and `dotenv` were missing from the dependencies list
**Why:** `npm install` doesn't install packages that aren't listed, even if imported.
**Action:** add both to the HANDOFF's dependency list.

### 3. Node.js pinned to LTS (v24) via Volta
**Why:** build env was on Node v26 (bleeding edge), which `better-sqlite3` v11 didn't support. LTS is the right practice regardless.
**Action:** require LTS in the HANDOFF; add a `volta.node` pin or `.nvmrc`.

### 4. `@anthropic-ai/sdk` updated to v0.105
**Spec said:** `^0.39.0` · **Shipped:** `^0.105.0`
**Why:** v0.39 bundled `node-fetch`, which caused `FetchError: Premature close` mid-stream on Node 24. v0.105 uses native `fetch` and fixed it.
**Action:** update to `@anthropic-ai/sdk@latest`; note old versions use `node-fetch` and break on Node 18+/24.

---

## Runtime observations (important for teaching)

### The hashing embedder failure mode was observed live

Query `"what kind of environment do goblins like to make their home in?"` returned 5 chunks:

| Rank | Content | Relevant? |
|---|---|---|
| 1 | Githyanki | ❌ |
| 2 | Grimlocks | ❌ |
| 3 | Goblins — "lair in caves, abandoned mines, despoiled dungeons" | ✅ |
| 4 | Stone Giants | ❌ |
| 5 | Goblin lairs — "festoon their lairs with alarms..." | ✅ |

**Two failure modes simultaneously:**
1. **Synonym blindness** — query says "environment"/"home"; the text says "lair"/"caves"/"dungeons". Bag-of-words has no concept of semantic equivalence.
2. **Stop word pollution** — function words ("their", "the", "in") dominate the vector; Githyanki/Grimlock chunks score well purely on shared grammatical structure.

**The LLM saved it** — Claude extracted the answer from chunks 3 and 5 despite low ranking. Teach this explicitly: the LLM can compensate for weak retrieval *if the right chunk is somewhere in top-k*. When it isn't (smaller k, larger corpus), the answer disappears. **This is a perfect 103 motivator — preserve the failure, don't fix it in 101.**

---

## Suggestions for the lesson content

**101:** add the live failure as a checklist item (observe + explain synonym blindness + stop-word pollution); call out the `dev:*` scripts; add a degraded-mode checklist item (run with empty key, verify context still holds the answer).

**102 (HTML ingest):** the noise is partly a *chunking* problem — naive fixed windows split across monster boundaries (a chunk straddling Githyanki→Goblin confuses embedding and citation). Structure-aware chunking (one chunk per monster/section) eliminates this — a concrete opening win for 102. Build 102 ingest around the v1 "store HTML + per-page metadata" insight.

**103 (real embeddings):** reuse the exact `environment/home` vs `lair/caves` query for before/after. Goal: goblin chunks rank #1 and #2 after the swap — the measurable win. v1 stopped here; calibrate depth past the frontier.

**104 (hybrid):** `rawText` + `meta` columns already exist (trivially populated). No migration — just populate richly and wire the BM25 path. Payoff of the 101 anticipation decision.

**107 (eval):** baseline from the live run — correct answer in chunks 3 and 5 of 5 → MRR = 1/3 ≈ 0.33. After 103 it should hit MRR = 1.0. Concrete eval story.

---

## Environment / setup notes (for future learners)
- **Node LTS required.** Node 26 breaks `better-sqlite3` native compilation. Pin to LTS.
- **SDK version matters.** `@anthropic-ai/sdk` < ~0.50 uses `node-fetch`, which breaks on modern Node with HTTP/2 streaming. Use latest.
- **The Anthropic connectivity issue** was an old-SDK `node-fetch` premature close, NOT network/proxy. Red herrings ruled out: corporate proxy, Pi-hole, IPv6 DNS.
- **`curl` vs Node diverging** is a useful diagnostic: if `curl` works but Node fails, the issue is the Node HTTP client layer, not the network. Add to a troubleshooting section.
