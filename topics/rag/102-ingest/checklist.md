# Understanding Checklist: RAG 102 — Ingestion (HTML → chunks)

> Build-along lesson. Hybrid checklist: **conceptual** understanding + **applied** ("did this in the build") items.
> Check items off only when understanding is demonstrated (own words / correct reasoning), not merely acknowledged.

## 1. The Problem
- [x] What is ingestion actually responsible for, and why is it the highest-leverage stage (errors here cascade)?
- [x] What's wrong with "naive fixed-size windows" — concretely, what did it cost us in the 101 run? (boundary-splitting; file=chunk is bloated/low-precision)
- [x] Why is "what is a chunk?" the central design decision of this stage? (precision↔completeness tradeoff)

## 2. The Solution
- [x] Fixed-size vs structure-aware vs semantic chunking — how each works and what it optimizes (chose structure-aware: one monster = one chunk)
- [x] The evidence, honestly read: what the chunking research *verified* vs what it *killed* (grounded boundaries in structure, not a magic token size)
- [x] The v1 insight built for real: store HTML + per-page metadata → chunk boundaries become near-free
- [x] Ingestion cost as a real tradeoff — chose deterministic structure-aware chunking (cheap) over LLM-semantic chunking (embeds every sentence); deferred typed entity extraction
- [x] Edge cases: tables/stat-blocks, cross-references, nested structure, oversized sections (tables separate/whole; oversized → sub-split)
- [x] What metadata to extract now so retrieval (104) and citation can use it → `source`, `breadcrumbs[]` (heading trail), `chunkId`; entity-type deferred

## 3. The Bigger Picture
- [x] How chunking choices ripple downstream into retrieval, reranking, generation, and citation quality (use-case dependent)
- [x] Why there's no portable "best" chunk size — and what to do instead (measure on your corpus, 107)
- [x] How D&D's standardized structure makes structure-aware chunking unusually clean here

## 4. Applied — the build (102 increment)
- [x] Real ingest design reasoned out (parse DOM → structure-aware chunk → metadata → store)
- [x] Decision: a chunk = one semantic unit (leaf heading section; one monster), size as a *guard* (sub-split oversized, merge tiny), tables kept whole
- [x] Metadata schema decided: `source`, `breadcrumbs[]`, `chunkId` — populates the `meta` field anticipated in 101 (no schema change)
- [x] Speced in `HANDOFF.md`; the boundary-splitting noise from 101 should visibly drop — ⏳ Claude Code builds
- [x] `build/STATE.md` updated (102 entry + parked structured-retrieval thread)
