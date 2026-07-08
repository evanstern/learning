# Teaching guide — 101 · Claude Plugins: From a Project to a Plugin

Companion to `deck.html` (14 slides). Per slide: an opening line, talking points, an "if asked", and a glossary at the end. The deck was built *after* the live build, so several slides carry findings that actually happened.

---

### 1 · Title — From a Project to a Plugin
**Open:** "We started with a hunch — that a pile of skills and conventions had quietly become a plugin — and we ended with one that builds itself. This is that path."
**Talking points:** Set expectation: this is conceptual *and* applied; the `educate` plugin is the worked example.
**If asked "what's educate?":** The orchestration layer of a personal learning project, packaged as a real plugin.

### 2 · The smell — "this wants to travel together"
**Open:** "How do you know something should be a plugin? It starts as a feeling."
**Talking points:** Composing skills + a script that does what the model can't + conventions. The tell is "I'd want to install this as one unit." The glue (the `CLAUDE.md`) is the interesting problem, foreshadow it.
**If asked:** "Is every useful folder a plugin?" No — only when the parts want to be shared/installed/versioned together.

### 3 · A plugin is a crate, not a brain
**Open:** "The biggest reframe: the plugin itself does nothing."
**Talking points:** Components do the work; the manifest only labels the box. Validate the learner's "like a project, formalized" instinct — it's correct.
**If asked "is the manifest required?":** Minimal plugins can rely on auto-discovery; the manifest adds metadata and (only when needed) non-standard paths.

### 4 · You can only fill fixed slots
**Open:** "Here's the entire menu — and you'll notice something missing."
**Talking points:** skills / commands / agents / hooks / MCP. You can't invent a new component type. Land the absence: no always-on-instructions slot. (Hover the chips for one-line glosses.)
**If asked "what about output styles/LSP/etc.?":** Real but peripheral; the five here are the load-bearing ones.

### 5 · Always-on vs. loaded-when-triggered
**Open:** "Why doesn't `CLAUDE.md` just become a skill? Because of *when* it loads."
**Talking points:** The contrast is the crux of the lesson. Always-on = rules always in force (good for a gate). Lazy = only when triggered (useless for a gate). The special thing about `CLAUDE.md` is its loading, not its text.
**If asked "could a SessionStart hook re-inject it?":** Yes — that's the other way to recover always-on; we chose the install-a-project route instead.

### 6 · Make the plugin a factory
**Open:** "If you can't bundle always-on context, install it."
**Talking points:** A planted project `CLAUDE.md` is always-on for free. The split: logic → `skills/lesson`; always-on copy → `templates/CLAUDE.md`; installer → `skills/start`. Plugin = factory, project = factory floor.
**If asked "isn't that just a scaffolder?":** Partly — but the scaffolded project keeps a live link to the plugin's skills/scripts/hook.

### 7 · Where each part landed
**Open:** "Concretely, here's the whole project mapped onto the menu."
**Talking points:** Walk the rows. Emphasize `CLAUDE.md` splitting in two and the gate changing from a git hook to a Stop hook.
**If asked "why reference teach-me/build-me, not vendor them?":** Scope — the plugin's value is the orchestration, not re-shipping Anthropic's skills. Vendoring is a later option.

### 8 · The gate splits across the line
**Open:** "One boundary is worth slowing down on: the gate can't live in one place."
**Talking points:** Code → plugin (must stop knowing where it lives). State (`progress.json`) + git wiring → project. Two different things both called "hook." (Hover both.)
**If asked "why can't progress.json live in the plugin?":** It's per-project data; the plugin is installed once and shared.

### 9 · A git-agnostic Stop hook
**Open:** "We threw out git entirely and gated on artifacts instead."
**Talking points:** Stop hook fires when Claude tries to finish; exit 2 blocks. Two real constraints we hit: it fires *globally* (must no-op outside educate projects) and `--check` is too noisy (added read-only `--gate`). Honour `stop_hook_active` or it loops.
**If asked "what does a global hook firing mean in practice?":** It runs in every repo where the plugin is installed — so it must be silent unless there's a project to gate.

### 10 · The plugin builds itself
**Open:** "The bonus goal — and it actually ran."
**Talking points:** Generator + self-referential spec → regenerates educate's skeleton. Be honest about the boundary: structure/manifest/frontmatter are mechanizable; bodies and script logic are authored.
**If asked "could it generate the bodies too?":** Not faithfully — that's the substance, and pretending otherwise is the magic version we avoided.

### 11 · Two install paths, one repo
**Open:** "Installing depends on *where* you run Claude."
**Talking points:** Cowork → `.plugin` (snapshot, accept button). Claude Code → marketplace (local path = live iteration). Develop via marketplace, distribute via `.plugin`. (Hover both terms.)
**If asked "where do I type `/plugin`?":** In an interactive Claude Code terminal session — not in Cowork, not a plain shell. In Cowork you install the `.plugin` file.

### 12 · Four findings worth keeping
**Open:** "Building it for real surfaced four things no doc warned us about."
**Talking points:** (1) `import.meta.url` coupling; (2) global hook firing; (3) declaring standard paths double-loads (the duplicate-hooks error, fixed in v0.1.1); (4) mounted-FS git lock files. These are the highest-value carry-forward.
**If asked "are these educate-specific?":** No — 2 and 3 hit any plugin; 1 hits any code you move into one.

### 13 · What you now know
**Open:** "Five sentences that weren't true for you 90 minutes ago."
**Talking points:** Recap as synthesis, not repetition. Plugin = packaging; no always-on slot → install one; code must stop knowing where it lives; hooks fire globally; one repo, both paths, self-buildable.

### 14 · Make it real
**Open:** "It's installed and self-building — here's where it goes next."
**Talking points:** Live-iterate via the marketplace; a future 102 on hooks & MCP in depth.

---

## Glossary
- **Plugin** — a shareable directory bundling components (skills, commands, agents, hooks, MCP servers) plus a manifest. Packaging, not behavior.
- **Manifest** (`.claude-plugin/plugin.json`) — declares name/version/metadata. Path fields are only for *non-standard* component locations; declaring standard paths double-loads them.
- **Skill** — `skills/<name>/SKILL.md`; instructions Claude loads when the request matches its description (lazy).
- **Always-on context** — a project `CLAUDE.md`, injected every session with no trigger. The property the plugin menu lacks.
- **Hook (Claude plugin)** — code that runs on a Claude event (Stop, PreToolUse, SessionStart…); exit 2 blocks. Distinct from a **git hook** (fires on `git commit`).
- **Stop hook** — fires when Claude tries to finish; our DoD gate. Must honour `stop_hook_active` to avoid loops.
- **`${CLAUDE_PLUGIN_ROOT}`** — the plugin's install dir at runtime; use it for all intra-plugin paths so nothing is hardcoded.
- **Marketplace** (`marketplace.json`) — a catalog listing plugins + a `source` for each. A local path enables live dev iteration.
- **.plugin file** — a zip of the plugin dir; the Cowork install format (accept-button preview in chat).
- **Self-build** — `make-plugin.mjs` + a spec regenerate the plugin's own skeleton; structure is mechanizable, substance is authored.
