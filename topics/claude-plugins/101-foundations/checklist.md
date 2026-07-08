# Understanding Checklist: Claude Plugins — Foundations (101)

> Checked off only when Evan demonstrates understanding in his own words / correct reasoning.

## 1. The Problem
- [x] What is a plugin *fundamentally* (packaging/distribution unit, not a thing that "does" work itself)
- [x] What problem do plugins solve that a bare project folder + CLAUDE.md does not (shareable, install-once-use-everywhere → demands project-agnostic code)
- [x] Why "a pile of curated parts that travel together" is the right smell

## 2. The Solution — anatomy
- [x] The component menu is *fixed*: skills, commands, agents, hooks, MCP servers (+ output styles, etc.)
- [x] The manifest (`.claude-plugin/plugin.json`) — what it is and what it is NOT (declares the box; doesn't run the show)
- [x] On-disk structure & the #1 trap (only plugin.json lives in `.claude-plugin/`; everything else at root) — verified on disk
- [x] How "curated code that does what Claude can't" actually gets invoked → hooks vs MCP servers vs skill-invoked scripts (progress.mjs = script wired by a hook for --check, called by a skill for --sync)
- [x] Namespacing (`plugin-name:skill-name`) and why it exists (→ `educate:start`, `educate:lesson`)
- [x] Marketplace = a catalog (`marketplace.json`); install/scope flow (plugin = box, marketplace = shelf; local-path install needs no marketplace)

## 3. The Bigger Picture — applied to *this* project
- [x] THE TENSION: where does our `CLAUDE.md` orchestration layer go? (no always-on slot in the menu; resolution = plugin INSTALLS a project CLAUDE.md — the always-on layer lives in the generated project, not the plugin)
- [x] Map the Learnings project → a plugin: teach-me/build-me→skills; CLAUDE.md→ skills/lesson + templates/CLAUDE.md; progress.mjs→scripts (project-agnostic); DoD gate→Stop hook; _template/schema→templates; +start installer + manifest
- [x] The self-building move: a generator + a self-referential spec regenerates educate's own skeleton (structure/manifest/frontmatter mechanizable; bodies authored) — demonstrated live
- [x] What we'd actually ship as the first artifact: the `educate` plugin at `topics/claude-plugins/build/educate/` (built + verified end-to-end)
