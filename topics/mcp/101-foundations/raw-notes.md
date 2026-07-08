# Raw Notes: MCP session

## Parked side-topics (revisit)
- **The actual wire schema/language MCP speaks** — it's JSON-RPC 2.0 over a transport (stdio or streamable HTTP). Evan wants to go deeper here: message shapes, capability negotiation, the handshake. Good standalone sub-session.
- VHS / Betamax / HD-DVD format-war analogy — MCP "won" via network effects, not technical inevitability; still contested.

## Demonstrated understanding so far
- Problem MCP solves: portability — implement once, plug into any client (no per-client re-implementation).
- Why a standard: collapses O(n²) integrations (M clients × N tools) to O(n) (M+N).
- Why now: the *consumer* became the autonomous model, so tools must self-describe for runtime discovery rather than being hand-wired by a dev.
- Three primitives by WHO pulls the trigger: tools = model-controlled, resources = app-controlled, prompts = user-controlled (e.g. /command).
- Architecture: HOST owns the LLM + trust; one CLIENT per server (the MCP socket, long-running); SERVER holds tools/data and never talks to the model.

## Open thread
- Security benefit of server-never-touches-model: Evan reached for "don't execute code directly in-session, buffer through the client." Refined → the host is the single mediation chokepoint (permissions, user approval, sandboxing); servers are isolated processes; model only ever sees controlled relayed output.
