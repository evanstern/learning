# {{PROJECT_NAME}}

A Socratic learning project, managed by the **educate** plugin. This file is the *always-on*
layer: it is loaded every session so the lifecycle, placement rules, and Definition of Done
are always in force. The *procedure* lives in the `educate:lesson` skill (lazy-loaded); this
file is the standing context that makes the rules apply even when the skill hasn't triggered.

## Structure
Organized by **topic**, then **lesson**:

```
topics/<topic-slug>/<NNN>-<lesson-slug>/
```

Files inside a lesson folder use bare names: `checklist.md`, `raw-notes.md`, and (if the
lesson has them) `HANDOFF.md` / `POST_BUILD_HANDOFF.md`, `deck.html`, `guide.md`.

## Lifecycle (use these exact words)
`scaffolded` → `taught` → `spec'd` → `built` → `decked` → `done`

Create `checklist.md` + `raw-notes.md` at the **start** (copy `topics/.template/`). Build the
deck + guide at the **end** (for delegated builds, after `POST_BUILD_HANDOFF.md` returns).

## Note-taking cadence (always on, enforced)
`raw-notes.md` is not optional and not a once-at-the-end summary — it is maintained **live,
one entry per exchange**. After every question you pose and the learner answers, append a
Session-log entry to `raw-notes.md` *before* posing the next question. One exchange, one
entry; no exchange goes unrecorded. Capture the aha moments, what was right/wrong, and
tangents worth chasing — this is the artifact a later review mines to improve this lesson
and past/future lesson plans. Treat a turn with no note as an incomplete turn.

## Running a lesson
Invoke the **`educate:lesson`** skill — it resolves placement, scaffolds, walks the
teach → build → deck seam, and gates `done`. To start or resume:
- New project setup: `educate:start`.
- Teaching: `/teach-me <subject>` (the plugin orchestrates around it).
- **Ground first (optional):** to base a lesson on real sources, the lesson skill hands off to the
  **research** plugin (into `topics/<topic>/research/` for the series, or a lesson-local `research/`),
  then teaches from the grounding — falling back to an inline pass if research isn't installed.
- Delegated build: the lesson skill writes a SPEC to the gitignored `.handoff/` → run the **build**
  plugin (`/build-me`) → return leg folds findings back in. Evidence is tracked in `progress.json`
  (`handoff.specd/returned/foldedIn`), not loose files.

## Definition of Done — the gate (git-agnostic)
A lesson is `done` only when every required artifact exists on disk. Enforced by the plugin's
script, not by git:

```
node ${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs --root <thisProjectRoot> <topic> --sync   # start & end of each lesson
node ${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs --root <thisProjectRoot> <topic> --check  # validate
```

`topics/<topic>/progress.json` is the machine-readable source of truth (schema:
`topics/progress.schema.json`). Its per-lesson `artifacts` map is DERIVED from disk by the
script — only judgment fields (`status`, `cursor`, `motivator`, `gotchas`) are hand-edited.
A `Stop` hook runs the read-only gate automatically and refuses to finish while any lesson is
marked beyond the artifacts that prove it. `progress.json` is the human-visible record of
that; `SERIES.md` (optional) is the narrative index — keep them consistent.

## Conventions
- Decks are single self-contained HTML files, built FROM `topics/.template/deck.html`.
- This project is for learning; keep sensitive business data out of it.
