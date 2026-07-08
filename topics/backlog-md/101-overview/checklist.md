# Understanding Checklist: Backlog.md — Effective Use & SpecKit Integration

> Check items off only when understanding is demonstrated (in your own words / correct reasoning), not merely acknowledged.

## 1. The Problem
- [x] What problem does Backlog.md solve, and for whom (solo dev vs. team, AI-agent-driven workflows)?
- [x] Why does this problem exist — what were people doing before (issue trackers, plain markdown TODOs, Jira)?
- [ ] What are the different ways task tracking could be solved, and where does Backlog.md sit among them? *(deferred — revisit briefly via the `focus` comparison, tangent noted)*

## 2. The Solution
- [x] How does Backlog.md actually work (CLI, file-backed tasks, folder structure, git-native storage)?
- [x] Why was it designed this way (markdown + git as the source of truth, no server/db)?
- [x] Key design decisions and tradeoffs (plain files vs. hosted tools, CLI-first vs. UI-first)
- [x] Edge cases and failure modes (merge conflicts, multi-agent/concurrent editing, scaling to large backlogs)

## 3. The Bigger Picture
- [x] Why does this matter for AI-agent-driven development specifically?
- [x] What does Backlog.md's "spec scaffolding" actually consist of today?
- [ ] Can SpecKit's spec-driven approach be integrated into Backlog.md's scaffolding — what would that mean concretely, and is it worth doing? *(in progress — enforcement mechanism under active discussion)*
