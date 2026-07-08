# RAG Teaching Series — Index

A build-along course on Retrieval-Augmented Generation: learn each concept, then apply it by rebuilding **the-stacks** from scratch as a **D&D RAG system** over D&D Beyond HTML. Grounded in an adversarially-verified [research corpus](research-corpus.md) (verified findings vs killed folk wisdom). Socratic gate stays on throughout — learn-first, not ship-first.

**Delegated build:** this teaching session **teaches + specs; it does not build.** Each lesson produces a `checklist.md`, `raw-notes.md` (build log), and a **`HANDOFF.md`** — a precise spec that **Claude Code** consumes to implement that increment in `topics/rag/build/`. A root **`build/STATE.md`** tracks architecture + what's-been-built so every handoff has continuity. The product is one iterative project, grown increment by increment, never re-scaffolded.

**Stack:** TypeScript · **Code:** `topics/rag/build/` (owned by Claude Code) · **Corpus:** D&D Beyond (HTML)

## Per-lesson loop
1. Teach Socratically — understanding demonstrated against `checklist.md`.
2. Capture in `checklist.md` + `raw-notes.md` (build log / decision record) as we go.
3. Reason out the build increment together (still gated) — decide *what* and *why*.
4. Write `HANDOFF.md` (this lesson's spec for Claude Code) + update `build/STATE.md`.
5. Claude Code implements against the handoff + current state, in a separate session.
6. Produce **`deck.html`** (self-contained slide deck — arrow keys/space, ⌘P → PDF handout) + **`guide.md`** (presenter's guide: per-slide opening line, talking points, "if asked", glossary). **Standard for every lesson** — these are the teach-others artifacts.

## The lessons

| # | Topic | Deck | Guide | Build increment | Status |
|---|-------|------|-------|-----------------|--------|
| 101 | **Foundations & the design space** — pipeline as decisions, RAG vs fine-tuning/long-context, error cascade, the verified-vs-folk-wisdom frame | `101-foundations/deck.html` | `101-foundations/guide.md` | Scaffold the-stacks v2 (TS), define corpus, sample DDB HTML | ✅ taught · ✅ **built** · ✅ deck+guide |
| 102 | **Ingestion: HTML → chunks** — parsing reality, fixed vs semantic chunking (evidence + folk-wisdom traps), ingestion cost | — | — | DDB HTML parser + chunker | 🚧 in progress |
| 103 | **Embeddings + vector store** — what embeddings are, cosine on the unit sphere, what a vector DB actually does (ANN tradeoffs), sqlite-vec internals | `103-embeddings/deck.html` | `103-embeddings/guide.md` | Embed (local Ollama, nomic-embed-text 768) + store | ✅ taught · ✅ **built** (MRR 0.33→1.0) · ✅ deck+guide · **done** |
| 104 | **Retrieval: dense vs sparse vs hybrid** — why dense misses identifiers, BM25/SPLADE, the financial-tables finding where BM25 won, RRF fusion | — | — | Hybrid retrieval | ⬜ planned |
| 105 | **Reranking** — bi- vs cross-encoder, joint attention, latency/accuracy trade, two-stage pattern | — | — | Rerank stage over top-K | ⬜ planned |
| 106 | **Generation + routing** — context assembly, and interrogating the-stacks' wiki-routing + vector-deep-store design against the evidence | — | — | End-to-end answers | ⬜ planned |
| 107 | **Evaluation** — Ragas metrics, measuring retriever and generator independently (re-implemented in TS) | — | — | D&D eval set + harness | ⬜ planned |
| 108 | **Failure modes & hardening (capstone)** — Barnett's 7 points / 4 categories, retrieval-errors-cascade, debugging playbook | — | — | Harden into the working product | ⬜ planned |

*Decks + guides are standard for every lesson (built at the end of each, capturing live build findings).*

## The artifacts (runnable / build)
- **the-stacks v2** — `topics/rag/build/` — the evolving product, implemented by Claude Code from per-lesson handoffs; grows one increment per lesson into a working D&D RAG system. *(scaffolded from the 101 handoff)*
- **`build/STATE.md`** — running architecture + build-state doc; source of truth each handoff builds on.

## Design decisions worth knowing
- **Build-along:** concepts live here in lesson folders; the product code lives in `topics/rag/build/`. Learn-first — every build step is reasoned out Socratically before it's written.
- **Epistemic spine:** the research corpus separates adversarially-verified findings (hybrid retrieval, cross-encoder rerank, 7 failure points, Ragas) from killed folk wisdom (magic chunk sizes, generic % improvements). We trust the former, stay skeptical of the latter, and re-verify domain-specific claims against our own corpus.
- **D&D as a revealing corpus:** dense with exact identifiers (spell/item names, stat blocks) and tables — exactly where dense embeddings fail and sparse/BM25 wins. The domain forces the interesting lessons (esp. 104).
- **TS over Python:** org standard. Friction (cross-encoder 105, Ragas 107) handled via hosted rerank APIs / transformers.js and by re-implementing eval metrics ourselves.
- **Walking skeleton from 101:** stable interfaces + deliberately dumb-but-real bodies; each lesson swaps an implementation, never reshapes a contract. Gives a runnable baseline from day one (which 107's eval stands on). Defer, don't gloss.
- **Learner-facing comments everywhere:** all build code/config is abundantly commented to be read and learned from; every dumb seam is tagged with the lesson that replaces it (`// DUMB (NNN): ...`).
- **Deck convention — glossary-on-hover:** decks gloss jargon with a self-contained, dependency-free hover tooltip (any element with a `data-tip` attribute, works on SVG too; ~15 lines inline, no CDN so the deck stays offline/print-safe). A visible `?` badge marks the hover target. First used on the 101 BM25 term.

## Parked / future
- Agentic / iterative retrieval (multi-hop) — Ragas is single-shot; open question from the corpus.
- Long-context embedding models vs chunking — does 8k+ context close the semantic-vs-fixed gap?
- Graph/structured retrieval over D&D entities (cross-references between spells, classes, monsters).
