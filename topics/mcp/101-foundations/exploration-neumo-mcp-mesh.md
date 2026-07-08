# Exploration: Neumo as an MCP mesh (real-world scenario)

**Status:** parked thought, to explore further in a later session. Captured 2026-06-20.
This is a *learning exploration* using a real work scenario — not a Neumo strategy doc.
Keep sensitive business specifics out; this is about the architecture pattern.

## The scenario (Evan's framing)
- Neumo was formed from **4 companies** coming together.
- Result: ~**16 distinct verticals** across different products (maybe more).
- Every language, every configuration — currently "a mess" (polyglot, heterogeneous).

## The idea
- Treat **each vertical as its own MCP server** — a clean, well-maintained interface over that vertical's data/capabilities.
- Build out ~16 well-maintained MCP servers.
- Then build **agentic workflows that communicate across these servers** — agents orchestrating work that spans verticals.

## Why MCP fits this shape (connects to what we learned)
- The verticals are already owned by **different teams, different stacks, different release schedules** — exactly the decentralized, independently-upgrading ecosystem MCP is designed for.
- MCP gives a **uniform interface** over a polyglot mess: doesn't matter if a vertical is Go, Ruby, Python — the server speaks the same protocol. (Portability / O(n²)→O(n).)
- **Capability negotiation** means each vertical's server can evolve on its own schedule without a flag-day across all 16.

## The hard problem Evan flagged
- **Staffing & ownership:** who writes and maintains each of the 16 servers?
- This is essentially **Conway's Law** in play: the system's structure will mirror the org's communication structure. 4-companies-becoming-1 with 16 verticals is an org problem as much as a technical one.

## Threads to explore when we return
1. Ownership model: central platform team builds all 16 vs. each vertical team owns its own server (the MCP "contract" as the team boundary). Tradeoffs of each.
2. What's the right **granularity** — one server per vertical? per capability? per data domain? (16 may be wrong number.)
3. The orchestration layer: where do cross-vertical agentic workflows live, and who owns *them*?
4. Governance: schema/versioning standards, auth/trust across verticals, a shared registry.
5. Failure modes at mesh scale: context bloat (16 servers' worth of tools), tool-name collisions across verticals, injection surface, observability.
6. Migration path: do you need all 16 at once, or is there a "wedge" first server that proves value?
7. Build vs. buy: do any verticals already have APIs that wrap cleanly, vs. needing real work?
