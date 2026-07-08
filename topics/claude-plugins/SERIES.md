# Claude Plugins — Teaching Series

How Claude plugins work, learned by turning a real project (the "Learnings" orchestration
layer) into a real, installable, self-building plugin: **`educate`**.

`progress.json` is the machine-readable source of truth; this file is the human narrative.

## The lessons

| # | Topic | Deck | Guide | Status |
|---|-------|------|-------|--------|
| 101 | **Foundations & anatomy (applied)** — a plugin is packaging, not behavior; the fixed component menu; the always-on vs. lazy tension and why `CLAUDE.md` has no slot; the factory resolution (install a project `CLAUDE.md`); mapping the project; the split gate; a git-agnostic Stop-hook gate; the self-build; two install paths | `101-foundations/deck.html` | `101-foundations/guide.md` | ✅ done |

## The artifact (runnable)

- **`educate` plugin** — its own git repo at `/Users/evanstern/Claude/Projects/Code/educate` (`master`, v0.1.1). Skills `educate:start` (installer) + `educate:lesson` (orchestration); a `Stop`-hook Definition-of-Done gate; project-agnostic `scripts/progress.mjs`; a self-build (`scripts/make-plugin.mjs` + `educate.plugin-spec.json`). Installable via `marketplace.json` (Claude Code) or the packaged `educate.plugin` (Cowork). The lesson folder keeps only a pointer (`build/README.md`).
- **Decision-tree diagram** — `101-foundations/plugin-decision-tree.svg` — the three gated flows (start installer, lesson lifecycle + DoD gate, Stop-hook gate) on one page.

## Design decisions worth knowing

- **A plugin doesn't act; its components do.** The manifest is a shipping label, not a brain.
- **No always-on slot → install one.** The plugin plants a project `CLAUDE.md` (always-on for free); the orchestration logic ships as `skills/lesson`.
- **Gate on artifacts, not git.** A `Stop` hook runs a read-only `--gate`; git is out of scope.
- **Code moved into a plugin must stop knowing where it lives** (resolve the project root; never trust `cwd`/`import.meta.url`).
- **Don't declare standard paths in the manifest** — it double-loads them ("Duplicate hooks file"); rely on auto-discovery.
- **One repo, two install paths** — local marketplace for live dev, `.plugin` snapshot for Cowork.

## Live gotchas (carry-forward)

- Plugin hooks fire **globally** → the gate must no-op outside educate projects.
- `--check` flags a stale map (normal mid-work) → a separate read-only `--gate` blocks only on real DoD violations.
- Mounted-filesystem git couldn't unlink its own lock files; stale `.git/*.lock` blocks the next commit until removed.

## Parked / future

- **102 — hooks & MCP servers in depth** (event types, blocking, an MCP server as a plugin component).
- Vendor `teach-me`/`build-me` into the plugin vs. keep referencing them.
- Fold the Stop-hook gate back into the live Learnings `CLAUDE.md` (supersedes its git pre-commit backstop).
