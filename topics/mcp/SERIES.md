# MCP Teaching Series — Index

A four-part course on the Model Context Protocol (plus a capstone), built for a technical team — each lesson has a slide **deck** (self-contained HTML; arrow keys / space; ⌘P → PDF handout) and a presenter's **teaching guide** (per-slide opening lines, talking points, "if asked", glossary). Run them in order; the capstone is the build that ties them together. Status as of this writing below.

## The lessons

| # | Topic | Deck | Guide | Status |
|---|-------|------|-------|--------|
| 101 | **Foundations & architecture** — why MCP exists (portability, M×N→M+N), why now (self-describing tools), the three primitives, host/client/server, transport & lifecycle, capability negotiation | `topics/mcp/101-foundations/deck.html` | `topics/mcp/101-foundations/guide.md` | ✅ done |
| 102 | **Context cost & failure modes** — token bloat, choice overload, the gateway/tool-search, prompt injection via tool output, confused deputy, RBAC vs provenance, containment > prevention, dual-LLM / taint / default-deny (CaMeL) | `topics/mcp/102-context-cost/deck.html` | `topics/mcp/102-context-cost/guide.md` | ✅ done |
| 103 | **Build a secure MCP agent** — a working support-refund agent: mock billing, MCP server, LangGraph dual-LLM + taint + deterministic gate; the attack dies at the gate | `topics/mcp/103-secure-agent/deck.html` | `topics/mcp/103-secure-agent/guide.md` | ✅ done |
| 104 | **Gateway & mesh operations** — granularity as a least-privilege boundary, namespacing, the registry, correlated failure + bulkheads, router quality/eval, ownership/Conway, zero-trust auth, wedge-first migration, when *not* to build | `topics/mcp/104-gateway-mesh/deck.html` | `topics/mcp/104-gateway-mesh/guide.md` | ✅ done |
| capstone | **Secure mini-mesh** (non-numbered) — two MCP servers + a real (simple) gateway + secure orchestrator + one cross-vertical workflow + trace UI; four extension seams (router / middleware / auth / trace); ties 101–104 together in one runnable build | — (build, no deck) | `topics/mcp/capstone/spec.md` | ✅ done |

Lessons now live under `topics/mcp/<NNN>-<slug>/` with bare filenames (`deck.html`, `guide.md`, `checklist.md`, `raw-notes.md`). Most lesson folders also hold a `checklist.md` and `raw-notes.md`; `103-secure-agent` and `104-gateway-mesh` predate the Definition-of-Done rule and are intentionally left without full checklist/notes (see `CLAUDE.md`).

## The artifacts (runnable / interactive)

- **103 demo** — `topics/mcp/103-secure-agent/demo/` — runnable TypeScript: flat-JSON store, MCP server, LangGraph orchestrator, deterministic gate. Runs with or without an `ANTHROPIC_API_KEY` (gate behaves identically). See `demo/README.md` and `demo/HANDOFF.md`. *(node_modules present → local `npm install` has been run.)*
- **103 browser simulation** — `topics/mcp/103-secure-agent/browser-sim.html` — zero-setup, scripted; step or auto-play the benign vs injection ticket and watch taint + the gate.
- **CAPSTONE** ✅ — `topics/mcp/capstone/` — the end-of-series artifact: two MCP servers + a real (simple) gateway + the secure orchestrator + one cross-vertical workflow + trace UI, built with **four extension seams** (router / call-middleware / auth / trace). Spec: `topics/mcp/capstone/spec.md`; runnable repo in `topics/mcp/capstone/demo/`. Built in Claude Code (real npm + LLM); runs with or without an `ANTHROPIC_API_KEY`.

## Design decisions worth knowing (consistent across decks, guides, and code)
- **Dual-LLM:** the planner sees only the trusted request and *proposes* actions; it never fires privileged tools directly. The quarantined LLM has no tools and only emits typed data. **Model proposes, code commits.**
- **The gate is plain code** (default-deny). "You can't prompt-inject an `if`." The MCP server is *in* the secure path — the gate sits *above* it (it's not bypassed).
- **Trust levels are read and enforced:** untrusted tool output is tainted (sticky); privileged tools only fire after the gate.
- **The gateway is real but deliberately simple** (a black box for now): real routing + logs + optional latency, with seams for future depth.

## Parked / future (see `TASKS.md`)
- "Inside the gateway/router" — building a real router, tracking recall@k hit-rates + cost, tuning it. (Its own lesson; Evan keen.)
- Reliability/failure sim (slow vertical + bulkheads/circuit breakers) with its own short deck; router-degradation sim; auth sim — all bolt onto the capstone's seams.
- A dedicated CaMeL deep-dive session.
- The actual Neumo MCP-mesh decision for the ~16 verticals (belongs in the Neumo project).
