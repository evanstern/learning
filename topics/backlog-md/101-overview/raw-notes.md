# Raw Notes: Backlog.md — Effective Use & SpecKit Integration

> **This file is append-only and ENFORCED.** After *every* question→answer exchange in the
> lesson, add one entry to the Session log below — before the next question is posed. One
> exchange, one entry. No exchange goes unrecorded.
>
> Why this matters: the raw notes are the highest-value artifact a lesson produces. They
> capture the AHA moments, what went right or wrong, and the tangents worth chasing — the
> raw material a later review uses to improve this lesson (and past/future lesson plans). A
> thin log is a thin review.

## Session log (one entry per exchange — newest at the bottom)

<!-- Copy this block for each exchange. Keep it fast; a terse entry beats a skipped one.
### [n] <3–6 word label>
- **Q:** the question posed
- **A (gist):** what the learner answered, in a line
- **Verdict:** aha · correct · partial · wrong · tangent
- **Note:** the insight, misconception, or thing to remember — the part worth keeping
-->

### [1] Why markdown-file task trackers exist
- **Mode:** socratic
- **Q:** Why does a markdown-file-backed task tracker exist given Jira/Linear/Issues already solve "track work"? What gap were they filling, esp. for AI agents?
- **A (gist):** Uses it for adhoc personal task jotting; likes co-locating issues with the code they cover; AI/MCP tool-use makes it a natural interface for agent workflows and leads into spec-driven dev naturally; has written a primitive precursor tool called `focus` on this machine. Wants to shift toward the practical "how to use it feature-by-feature" rather than more "why."
- **Verdict:** correct
- **Note:** Learner already has the conceptual "why" (co-location with code, git-native, AI-agent interface) — no need to belabor Section 1. Explicit request to prioritize mechanics/workflow over more conceptual framing. `focus` (learner's own prior tool) is a tangent worth a quick compare-and-contrast later, not now.

### [2] Deflected to "draw it for me"
- **Mode:** socratic (attempted) → pivoted to worked-example
- **Q:** Walk through, command-by-command, how you'd break a real feature into Backlog.md tasks — where's the line between one task vs. subtasks, and what acceptance criteria would you write for an AI agent picking it up cold?
- **A (gist):** Asked for a visual/worked example instead of answering directly.
- **Verdict:** tangent
- **Note:** Learner processes better from a concrete worked example than an abstract prompt — give one, then loop back and have them apply the same pattern to their own feature so the reasoning still comes from them.

### [3] Meta-applied the pattern to this lesson itself
- **Mode:** worked-example
- **Q:** Sketch your own real feature as parent/subtask tree with deps and ac: lines.
- **A (gist):** Used this very lesson as the example — task-0010 "Learn about Backlog.md" -> task-0011 "Get taught by /educate:lesson" (ac: Socratic method passes) -> task-0012 "Try the flow out on one more task" (depends on 0011, ac: human checks off / manual approval gate).
- **Verdict:** aha
- **Note:** Correctly used parent/subtask nesting, a `depends:` edge, and wrote acceptance criteria as binary checks — including a legitimate pattern I hadn't introduced (a human-approval-gate AC instead of an automated-test AC), which is a real, supported style in task-based workflows. Sidestepped applying it to genuinely new external work, but the mechanics (structure/dependency/AC-as-check) are demonstrated.

### [4] Merge conflicts on task files
- **Mode:** socratic
- **Q:** Two concurrent edits to task-0012's status, then merge — what actually happens (given task = plain text file), and does git-native storage *solve* concurrency vs. Jira, or relocate it?
- **A (gist):** It's a git merge conflict on a text file, resolvable via normal git-merge tooling (even easier with AI/MCP automation); text files are inherently easy to merge. Implicitly: it relocates the problem to git's mature tooling rather than "solving" concurrency outright.
- **Verdict:** correct
- **Note:** Nailed the core tradeoff — plain text + git means you inherit git's merge ecosystem "for free," including AI-assisted resolution, instead of needing a bespoke concurrency model like a hosted tool would build server-side.

### [5] Reframed the integration question — compose, don't merge
- **Mode:** discussion
- **Q:** Where would SpecKit's phase-gated pipeline fit into Backlog.md's task model — docs entries, a new task type, something else — and what would Backlog.md lose by adopting SpecKit's rigor?
- **A (gist):** Rejects merging the two scaffolds. Proposes instead: SpecKit owns the spec artifacts (spec.md/plan.md/tasks.md), Backlog.md tracks the major phases of design/implementation as tasks — the two systems complement rather than absorb each other. Now asks the real question: how do you *enforce* tight integration between them so they don't drift apart.
- **Verdict:** aha
- **Note:** This is the sharper design than what I posed (I was implicitly asking "how do they merge," learner correctly rejected that framing). This becomes the crux of the rest of the lesson — a live design discussion, not a checklist quiz.

## Aha moments
- [3] Learner independently arrived at "AC = human sign-off gate" as a valid acceptance-criterion style, without being taught it — shows they grasp that ACs are about *verifiability*, not necessarily *automation*.
- [5] Learner rejected the "merge the two scaffolds" framing I posed and replaced it with "compose them, SpecKit owns spec content, Backlog owns phase tracking" — a better architecture than the question implied.

## Misconceptions corrected

## Tangents worth revisiting
- Learner's own tool `focus` (on this machine) as a "primitive version" of Backlog.md — worth a quick compare/contrast once the mechanics are covered, to sharpen what Backlog.md adds.

## Open questions
