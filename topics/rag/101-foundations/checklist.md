# Understanding Checklist: RAG 101 — Foundations & the Design Space

> Build-along lesson. Hybrid checklist: **conceptual** understanding + **applied** ("did this in the build") items.
> Check items off only when understanding is demonstrated (own words / correct reasoning), not merely acknowledged.

## 1. The Problem
- [x] What problem does RAG actually solve? (grounding generation in external/changing/private knowledge)
- [x] Why does the problem exist — what's wrong with just using the model's parametric knowledge? (frozen, lossy, unattributable weights)
- [x] RAG vs the alternatives: fine-tuning, long-context stuffing, tool/SQL calls — when does each win? (fine-tuning = behavior not facts; re-freezes weights, can't cite)
- [x] Why retrieval errors *cascade*: retrieval sits upstream of generation (can't prompt your way to context that was never retrieved)

## 2. The Solution
- [x] The three-stage pipeline as a chain of *decisions*: ingest → retrieve → generate
- [x] Each stage's job and its main knobs (what you actually get to tune)
- [x] Epistemic frame: verified findings vs folk wisdom — why most RAG blog numbers don't survive scrutiny (settled *shape*, unsettled *parameters*)
- [x] Locate the-stacks' original architecture (curated wiki routing + vector deep store) on this map — incl. pre-filter (route) vs post-filter (prune) tradeoff

## 3. The Bigger Picture
- [x] Why RAG matters / what it enables that a raw LLM can't
- [x] How the stages fit together; what we're optimizing across the whole series
- [x] What makes D&D Beyond HTML a *revealing* corpus — rigidly standardized structure + wildly varied content + dense identifiers/tables → failure modes surface fast and legibly (confirmed live in the 101 run)

## 4. Applied — the build (101 increment)
*Teach-me session specs; Claude Code builds. "Speced" = done here; "build" = handed off.*
- [x] Stack & project shape for the-stacks v2 decided and justified (TypeScript + sqlite-vec + Ollama)
- [x] Walking-skeleton approach chosen and justified (stable interfaces + dumb-but-real bodies; defer don't gloss)
- [x] Repo skeleton + interfaces designed and **speced in `HANDOFF.md`** (ingest/retrieve/generate seams) — ⏳ Claude Code builds
- [x] Target corpus defined (D&D Beyond HTML, local/git-ignored); day-one demo = Monster Manual goblin page (Evan drops the file)
- [x] Pipeline stages map cleanly onto real module boundaries (see `HANDOFF.md` §3 + `build/STATE.md`)
- [x] Learner-facing-comments constraint baked into the handoff + project conventions

## 5. Empirical — observed in the 101 build run
*The build produced a real failure; these are demonstrated against actual output, not just described.*
- [x] Walking skeleton runs end-to-end on the goblin demo (ingest → retrieve → generate → cited answer)
- [x] **Explain the dumb-embedder failure:** on "environment/home", goblin chunks ranked 3rd & 5th *below* Githyanki/Grimlocks. Two causes named: synonym blindness (no semantics) + stop-word pollution (function words dominate the vector).
- [x] Explain why the LLM still answered correctly — and the condition under which that rescue *fails*: the right chunk must reach the LLM (be inside top-k). Shrink k or grow the corpus → it falls past the cutoff → no model can recover it. Retrieval is the ceiling.
- [x] Degraded mode (empty `ANTHROPIC_API_KEY`) returns retrieved context without crashing
