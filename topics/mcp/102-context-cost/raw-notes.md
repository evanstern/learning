# Raw Notes: MCP 102 session

## ▶ RESUME HERE (next session)
DONE: dual-LLM quarantine diagram + Evan traced the attack correctly (dies at quarantine wall;
last line of defense = deterministic policy engine; a fooled LLM can produce a bad *value*,
never a bad *action*; security boundary = taint-tracking + policy completeness).
Also nailed: "trusted" = the principal whose authority we act under, scoped to their own
permissions — NOT "safe"; injection = a non-principal borrowing the principal's authority;
agent privilege must never exceed the trust level of whoever can drive it.

Still owed in 102: quick failure modes (tool-name collisions, versioning/schema drift,
observability) and the **mesh-scale design** section (granularity, registries, orchestration,
Conway's Law ownership) against Neumo's 16 verticals. Plus the parked full **CaMeL** session.

## Key correction + insights (from Evan's restatement)
- **What gets quarantined = untrusted DATA the plan touches (emails, tickets, tool results),
  NOT the user's own prompt.** The user prompt is trusted (principal) → goes straight to the
  planner. Quarantine is a wall between untrusted data and the tool-holder, not a per-prompt
  sanitizer.
- Planner emits STRUCTURED output too — a plan/program (typed tool calls + args), not prose.
  That's what makes actions checkable by the policy engine.
- **Policy engine = allowlist / default-deny by capability, NOT red-flag detection.** Don't
  enumerate "bad things" (blocklist trap = same losing game as detecting all injections).
  Ask "is THIS action with data of THIS provenance explicitly permitted?" Security boundary =
  completeness/tightness of the allowlist. (← the crux Evan flagged; central to CaMeL.)

## Definitions to keep straight
- **"CaMeL script" is NOT a thing.** CaMeL = a defense *system/architecture* (dual-LLM +
  custom interpreter + capabilities/policies), not a language or file format. The planner
  emits a plan written in a **locked-down subset of ordinary Python** (parsed via Python's
  `ast`). No CaMeL DSL, no `.camel` files. Security = interpreter + capabilities, not syntax.
- **The executor** (aka the runtime): the deterministic plan-runner — plain code in the
  trusted orchestration layer, same place the policy engine lives. Runs the planner's emitted
  plan/program, carries taint per value, gates each step, and dispatches tainted-data steps to
  the quarantined LLM. NOT an LLM. In LangGraph terms = the graph executor running nodes/edges.
  (Don't call it "the interpreter" loosely — define where it lives.)

## Parked side-topics (revisit)
- **The CaMeL pattern — dedicated future session.** "Defeating Prompt Injections by Design"
  (Google DeepMind, 2025). The frontier answer to "RBAC doesn't touch injection."
  Rough shape to verify & teach:
  - Two LLMs: a **Privileged LLM (P-LLM)** that plans/orchestrates and emits code, and a
    **Quarantined LLM (Q-LLM)** that parses untrusted data but has NO tool access.
  - Untrusted content never reaches the privileged planner as instructions; it's handled as
    data with tracked provenance.
  - **Capabilities + a deterministic policy engine** decide what each value is allowed to do
    (data-flow / control-flow separation), enforced outside the model.
  - Why it matters here: it's the principled version of the planner/executor quarantine we
    sketched — containment by construction, not by hoping the model resists a prompt.
  - To explore: how it maps onto an MCP gateway + 16-vertical mesh; cost/latency; where it
    breaks; what's overkill vs. justified.

- **Orchestration frameworks as where gates live (revisit).** A deterministic gate in
  production = a conditional edge / router in an orchestration graph:
  - LangGraph: stateful graph; LLM agents are nodes, gates are **conditional-edge functions**
    (plain code) deciding the next node. Topology is fixed code the model can't rewrite.
  - n8n: **IF / Switch** nodes do the deterministic branching; agent nodes are the LLM parts.
  - **Critical rule:** the gate must branch on *structured, trusted state* (computed amount,
    result status) — NOT on the model's free-text say-so, or injection leaks back in one layer up.
  - Future: build a small LangGraph example with a real gate against the support-ticket scenario.

## Demonstrated understanding so far (102)
- Context cost: tool catalog (names/descriptions/schemas) injected at connect time → token
  bloat AND choice-overload (selection accuracy collapses with a huge menu).
- Mitigation = gateway/proxy + tool search (tool RAG); this session itself uses deferred
  tools + ToolSearch. New failure surfaces it adds: ownership burden (Conway), single point
  of failure + extra hop, router can silently mis-select (model never sees the right tool).
- Prompt injection via tool output: data & instructions share one channel. Mesh amplifier:
  agent's effective privilege = union of all reachable tools, driven by lowest-trust input.
- RBAC misses it: identity vs. provenance/integrity — different axis.
- Defenses: scoped task-agents (no god-agent), deterministic gates + caps (un-injectable),
  human-in-the-loop for privileged actions, dual-LLM/planner-executor quarantine (→ CaMeL).
  Principle: **containment > prevention.**
- Deterministic gate ≠ human node — it's plain policy code, un-injectable. Compose them:
  auto-approve bounded cases, escalate ambiguous ones. Escalation rule of thumb:
  **escalate toward cleaner trust, never toward more privilege on the same dirty input.**
