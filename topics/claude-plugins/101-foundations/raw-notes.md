# Raw Notes: Claude Plugins — Foundations (101)

> Running notes captured during the session.

## Evan's starting model (gauged at the top)
- Pictured: `/educate` with `skills/` (teach-me, build-me, etc-me), `tools-and-scripts/progress.mjs`, and a `CLAUDE.md`.
- Framing: "like a Project structure but with more formalization — curated tools that work together and do things Claude can't even with connectors (e.g. progress.mjs + the artifacts it produces)."
- Assessment: structurally close. `skills/<name>/` is exactly right. Strong instinct that a plugin formalizes a project. Two gaps to work: (1) no manifest yet, and he's casting CLAUDE.md as the "show runner" — but CLAUDE.md isn't a plugin component type; (2) loose scripts aren't a component — they're invoked via hooks / MCP / skills.

## The central tension (this lesson's payoff)
- Plugins bundle a FIXED menu: skills, commands, agents, hooks, MCP servers, output-styles. There is no "CLAUDE.md" slot.
- So: where does our orchestration layer (placement, lifecycle, DoD gate, teach↔build seam) live when packaged? Candidates: fold into a skill, become a command, become a hook (the DoD/pre-commit gate IS a hook), or stay as un-shippable project context.
- Note: our own CLAUDE.md already foresaw this ("If this layer ever becomes its own skill/agent, the orchestration lifts out").

## Tidbits / things to remember
- Plugin = a crate; it doesn't *do* anything. The fixed menu (skills/commands/agents/hooks/mcp) does the work. The manifest is a shipping label, not a brain.
- progress.mjs: the SCRIPT is just a file; a HOOK is the wiring (event→action). Same script, two callers: hook for the --check gate, skill for --sync.
- The special thing about CLAUDE.md is its LOADING (always-on, ambient), not its content. The plugin menu has no always-on-context slot. A skill is lazy (description-triggered).

## KEY RESOLUTION (Evan's own insight — strong)
- Don't cram orchestration into an always-on plugin component (there isn't one). Instead the plugin INSTALLS itself into a Project folder, writing a CLAUDE.md there — exactly like the productivity plugin's `start`. The always-on layer then lives in the GENERATED PROJECT (project CLAUDE.md is always-on), not in the plugin.
- So the plugin = a factory/installer + the shippable parts (skills, hooks, templates). The live workflow lives in the stamped-out project.
- Two ways to recover "always-on": (a) a SessionStart hook re-injects context each session; (b) an init skill/command writes a project CLAUDE.md once. Evan favors (b) — better fit for a folder-centric system, and it's the productivity-plugin precedent.

## The split gate (Evan reasoned this out, incl. the portability catch)
- CODE (progress.mjs) → ships in plugin at scripts/, called via ${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs. BUT only works once rewritten project-agnostic: take projectRoot+topic as input (or discover root via marker file); stop trusting cwd / hardcoded topics/ path. "Moving code into a plugin = it must stop knowing where it is."
- STATE (progress.json) → per-project, lives in generated project. Can't sit in install-once plugin.
- GIT pre-commit hook → lives in project .git/hooks/; plugin can't write there → the /start installer plants it.
- TWO different "hooks": git hook (fires on git commit; what our gate is today) vs Claude plugin hook (fires on Claude events; what the menu offers). Not the same system.

## DESIGN DECISION (Evan): drop git, gate via a Claude plugin hook
- The DoD gate should NOT be a git pre-commit hook. Git is out of scope / shouldn't have been in the workflow. Gate on auditable artifacts, git-agnostic.
- New design: a Claude plugin hook refuses to let a lesson reach `done` / a series close unless progress.mjs --check passes against on-disk artifacts. Enforcement point = the status-advance operation goes through the plugin's script, fronted by a PreToolUse/Stop hook running --check.
- TRADEOFF (chosen knowingly): a Claude hook fires only on Claude-mediated changes, not on arbitrary hand-edits (git hook caught any commit). Fine for a Cowork-centric workflow; arguably better (gate lives with the assistant).
- CARRY-FORWARD: this supersedes CLAUDE.md's current "git pre-commit hook" backstop — update that when we revise the orchestration into the plugin.

## BUILD FINDINGS (live build of the `educate` plugin → topics/claude-plugins/build/educate/)
- GOTCHA: a plugin hook fires GLOBALLY (every project where the plugin is installed), not just educate projects. A naive Stop gate would block finishing ANY conversation anywhere. Fix: the gate must no-op when there's no topics/ (not an educate project). Verified: exit 0 in /tmp.
- GOTCHA: --check also flags a stale artifacts map (recorded≠disk), which is normal mid-work. Using --check as the Stop gate would nag constantly. Fix: added a read-only --gate mode that blocks ONLY on real DoD violations (status past artifacts), ignoring staleness. --sync/--check stay for lesson boundaries.
- HOOK SCHEMA (verified vs docs): { "hooks": { "<Event>": [ { "matcher": "*", "hooks": [ {"type":"command","command":"..."} ] } ] } }. Block = exit 2 (stderr → Claude). Stop hook must honor stop_hook_active to avoid infinite loops. Two blocking mechanisms: exit 2, or exit 0 + JSON {permissionDecision:"deny"} (PreToolUse).
- TWO "hooks" confirmed distinct: git hook (git commit) vs Claude plugin hook (Claude events). We chose the Claude Stop hook; git is out.
- progress.mjs decoupling: original used dirname(import.meta.url) as the topics dir → breaks in a plugin. Now resolves root via --root flag / EDUCATE_PROJECT_ROOT / walk-up for topics/. "Code moving into a plugin must stop knowing where it is."
- SELF-BUILD result: make-plugin.mjs + educate.plugin-spec.json regenerate educate's own skeleton; REAL vs GENERATED component trees match. Honest boundary: structure + manifest + skill frontmatter are mechanizable; skill BODIES / scripts / templates are authored payload (AUTHORED-PAYLOAD.txt lists them).
- VERIFICATION: all green — manifest parses, only plugin.json in .claude-plugin/, gate blocks bad 'done' (exit 1/2), no-ops outside projects (exit 0), loop-guard works.

## CARRY-FORWARD / open
- Decide: vendor copies of teach-me/build-me into the plugin (fully self-contained) vs reference (current). Currently referenced.
- When we fold this back into the real project: the live CLAUDE.md's "git pre-commit hook" backstop is superseded by the Stop-hook gate — update it.
- Lesson 101 is `taught` + artifact built/verified, but NOT `done`: no deck.html/guide.md yet (our own gate would block 'done'). Next: build deck FROM _template/deck.html + guide.md.

## PACKAGING & MOVE (done)
- Two install paths, one repo: Cowork installs a `.plugin` (a zip; accept-button in chat) = ship-the-snapshot; Claude Code installs from a marketplace (git URL or LOCAL PATH) = iterate live (edit → /reload-plugins, no re-zip).
- educate moved out of Learnings → own git repo at /Users/evanstern/Claude/Projects/Code/educate (master, v0.1.0). Added marketplace.json (source "."), README, .gitignore, package.json (npm run package / selfbuild).
- Packaged educate.plugin → delivered to outputs.
- GOTCHA (env): on the mounted FS, git couldn't unlink its temp/lock files (.git/*.lock) — commit still landed; had to enable cowork file-delete for the Code folder and rm the stale locks so future commits aren't blocked.
- Validation per Cowork rules: name kebab-case ✓, each skill has SKILL.md ✓, hooks/marketplace JSON valid ✓, only plugin.json + marketplace.json in .claude-plugin/ ✓.

## GOTCHA (install-time, v0.1.1 fix) — duplicate hooks
- On first install + /reload-plugins, Claude Code errored: "Duplicate hooks file detected: ./hooks/hooks.json ... The standard hooks/hooks.json is loaded automatically."
- Cause: the manifest declared "hooks": "./hooks/hooks.json" AND "skills": "./skills" — but those STANDARD locations are auto-discovered. Declaring a standard path double-loads it.
- Rule: manifest path fields (skills/hooks/agents/mcpServers) are ONLY for NON-standard locations. For the standard layout, declare nothing — rely on auto-discovery.
- Fix: removed both fields from plugin.json AND from make-plugin.mjs's generated manifest (else the self-build would reproduce the bug). Bumped 0.1.0 -> 0.1.1, repackaged.
- Reinstall: re-accept the new educate.plugin (Cowork) OR reinstall from the local marketplace then /reload-plugins (Claude Code).

## Tangents worth revisiting
- BONUS GOAL: the plugin builds itself. ✓ DONE (see SELF-BUILD result above). Reachable because a plugin is just files + a manifest — and doubly so given the init/factory design (the plugin already knows how to write a folder structure).

## Open questions
