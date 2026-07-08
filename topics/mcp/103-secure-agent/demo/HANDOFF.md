# Handoff — finish verifying this demo in Claude Code

This repo (the MCP 103 secure-agent demo) was authored in a Cowork sandbox that **cannot reach the npm registry or api.anthropic.com** (allowlisted network → `403`). So dependency install, full typecheck, and live-LLM runs were not possible there. Everything below is what a local Claude Code session should do to take it the last mile.

## Authoritative secure design (resolves an earlier doc ambiguity)
The MCP server must be **in the secure path**, not a bypassed strawman. Wire it like this:
- **The privileged tool (`issue_refund`) is NOT bound to the planner LLM.** Bind only read tools (or none). The model *proposes* a refund via the quarantined structured output; it never calls the privileged tool directly. (Model proposes, code commits.)
- **The graph executor reads each tool's declared trust level** (from `mcp/tools.ts`) and acts on it — this is the gap to close (levels were defined but never read):
  - `get_order` (trusted) → call via MCP directly.
  - `get_ticket` (untrusted) → call via MCP, then wrap the result `Tainted`.
  - `issue_refund` (privileged) → run `policy.ts` FIRST; invoke the MCP tool only on `ALLOW`, else escalate.
- **Keep the "naive foil" as a one-line trace/comment, not the architecture:** "a bare MCP server runs `issue_refund` for anyone — that's why the gate lives above it."
- Net effect: every tool executes through MCP, trust levels are functional, and the deterministic gate mediates the privileged MCP call. The trace should show the gate sitting between the planner's intent and the MCP execution.

## Already verified (no deps needed)
- `src/orchestrator/policy.ts` + `src/orchestrator/taint.ts` were executed against both scenarios using Node 22 type-stripping. Real output:
  - `tkt_123` (benign $42) → **ALLOW** ("within cap, order belongs to ticket customer…")
  - `tkt_666` (injection, $9,999) → **ESCALATE** ("exceeds order total… escalating")
- All 16 source files pass a syntax parse; `data/billing.json` is valid.

## Not yet verified (needs `npm install`)
- Dependency resolution against the live registry (versions are pinned but unconfirmed).
- `tsc --noEmit` against the real type declarations.
- MCP server wiring (`@modelcontextprotocol/sdk`), the LangGraph graph (`@langchain/langgraph`), and live LLM calls (`@langchain/anthropic`).

## Do this (in order)
```bash
cd ~/Claude/Projects/Learnings/topics/mcp/103-secure-agent/demo
npm install
npm run typecheck     # <-- the real green light; fix any type errors
npm run demo          # CLI: runs BOTH tickets, no API key needed
npm run web           # UI at http://localhost:3103 (submit both tickets)
# optional live-LLM mode:
export ANTHROPIC_API_KEY=sk-...
npm run demo
```

### Expected outcomes
- `npm run demo` prints: `tkt_123 → ALLOW` (simulated $42 receipt) and `tkt_666 → ESCALATE` (no refund).
- Live mode: planner/quarantine wording will vary run-to-run; the **gate verdicts must stay identical** (ALLOW / ESCALATE). If they don't, that's a real bug — investigate the gate, not the model.

## Likely gotchas (fix as needed)
- **Dep versions:** if a pinned version 404s, bump to the latest compatible. Constraints that matter: `zod` must stay **v3** (`^3.25`, NOT v4) for MCP SDK + LangChain compatibility; `@langchain/anthropic` ~`0.3`, `@langchain/langgraph` ~`0.x`, `@langchain/core` matching, `@modelcontextprotocol/sdk` ~`1.x`.
- **`.js` import specifiers in `.ts` files are intentional** (NodeNext module resolution). Don't strip them.
- **`ChatAnthropic.withStructuredOutput(schema)`** — confirm the signature matches the installed `@langchain/anthropic`; adjust if the API shifted.
- **LangGraph `StateGraph` API** (`addNode` / `addEdge` / `addConditionalEdges`, channel/`Annotation` state) can differ across minor versions — reconcile `src/orchestrator/graph.ts` with the installed version.
- **Node 20+** required; run scripts use `tsx`.

## Where the security lives (for review)
- `src/orchestrator/policy.ts` — deterministic default-deny gate (the un-injectable `if`s)
- `src/orchestrator/taint.ts` — sticky provenance tracking (`Tainted<T>`, `reveal()`)
- `src/orchestrator/planner.ts` / `quarantine.ts` — dual-LLM split (planner holds tools / quarantine has none)
- `src/orchestrator/graph.ts` — LangGraph wiring; the gate is a code-driven conditional edge
- `src/mcp/tools.ts` — tool trust levels (`get_ticket` untrusted, `get_order` trusted, `issue_refund` privileged)

## Definition of done
`npm run typecheck` is clean, `npm run demo` shows ALLOW + ESCALATE, and the web UI renders the step trace. Live-LLM mode is a bonus once a key is set.
