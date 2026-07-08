# Understanding Checklist: MCP 102 — Context Cost & Failure Modes

Prereq: MCP 101 (foundations & architecture) — done. Calibrated for Evan (builds MCP servers).
Throughline: pressure-test the design against the **Neumo 16-vertical mesh** scenario.

### 1. Context cost (the tax nobody mentions)
- [x] What gets injected into context when you connect a server, and when → full tool catalog (names, descriptions, schemas) at connect time
- [x] Why N servers × M tools each is a real problem (token budget, latency, $$) → hundreds of tools = tens of thousands of tokens before any work
- [x] Effect on model behavior: tool-selection accuracy degrades as the menu grows → choice overload; can't value-rank near-duplicate tools across verticals
- [x] Mitigations: tool filtering/namespacing, lazy/dynamic discovery, tool search/gateways, fewer-bigger vs many-small tools → gateway/proxy + search_tools (tool RAG); this very session uses deferred tools + ToolSearch. NEW failure surfaces: (1) ownership/maintenance burden (Conway's Law), (2) single point of failure + extra hop/latency, (3) router silently mis-selects → model never sees the right tool.

### 2. Failure modes
- [ ] Tool-name collisions across servers (acute in a 16-vertical mesh)
- [x] Prompt injection via tool *output* → data & instructions share one channel; model can't separate them. Mesh amplifier: agent's effective privilege = UNION of all reachable tools, driven by lowest-trust input (customer ticket) → cross-vertical escalation = confused deputy w/ "root."
- [x] Over-broad tools / confused-deputy & auth scoping → RBAC misses (it's identity, injection is provenance/integrity). Defenses: scoped task-agents (no god-agent), deterministic gates + caps on high-risk tools, human-in-the-loop for privileged actions, dual-LLM/planner-executor quarantine (CaMeL). Principle: containment > prevention.
- [ ] Versioning & schema drift in practice
- [ ] Observability: knowing what the agent actually called and why

### 3. Mesh-scale design
- [ ] Granularity: server-per-vertical vs per-capability vs per-domain
- [ ] Gateways / routers / registries to tame many servers
- [ ] Where orchestration lives; trust & governance across the mesh
- [ ] Conway's Law: ownership model as the real constraint (links to exploration-neumo-mcp-mesh.md)
