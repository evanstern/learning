# Understanding Checklist: MCP (Model Context Protocol)

Calibrated for Evan — builds custom MCP servers already. We skip "what is a tool" and
hunt the deeper why/tradeoffs.

### 1. The Problem (the "why a protocol at all")
- [x] What problem does MCP solve that function-calling / a plain SDK / a REST API didn't? → portability; no per-client re-implementation
- [x] Why a *standard protocol* rather than each app inventing its own plugin API? (the NxM problem) → O(n²) integrations collapse to O(n)
- [x] What changed about *who* the client is, that made this matter now? → the consumer became the autonomous model; tools must self-describe for runtime discovery, not hand-wired paths

> **Scope:** This is MCP 101 — foundations & architecture. Context cost, failure modes,
> and ecosystem strain moved to **MCP 102** (`topics/mcp/102-context-cost/`).

### 2. The Solution (design & shape)
- [x] The three primitives — tools, resources, prompts — and why they're distinct → the axis is WHO pulls the trigger: model (tools) / app (resources) / user (prompts)
- [x] Why the client/host/server split is drawn where it is (who holds the model? who holds trust?) → host owns LLM+trust; 1 client per server; server isolated, never sees model
- [x] Transport & lifecycle: stdio vs HTTP, capability negotiation, statefulness → transport=pipe (stdio local / HTTP remote), JSON-RPC on top; initialize handshake negotiates optional capabilities → graceful degradation, no version lockstep
- [x] Key design decisions & tradeoffs → control axis (model/app/user), runtime discovery, capability negotiation. (Context cost → MCP 102.)

### 3. The Bigger Picture
- [x] How it connects to Evan's own work → coda-lite/focus/the-stacks; and the Neumo 16-vertical mesh idea (see exploration doc)
- [→] Failure modes: tool-name collisions, context bloat, prompt-injection via tool output, versioning → **MCP 102**
- [→] Where MCP's design pushes the ecosystem (and where it strains) → **MCP 102**
