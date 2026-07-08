# Understanding Checklist: Cross-Server Auth & Identity Propagation (MCP 105)

> How does MCP server A (Billing) know that a request carries the credentials of an
> authenticated user — especially when there are multiple LLMs and multiple MCP servers (HR, Billing) in play?
> Check items off only when understanding is demonstrated in your own words / correct reasoning.

## 1. The Problem
- [x] What "the user is authenticated" actually has to mean across a process/network boundary
- [x] Why Billing can't just *trust HR's word* (or the LLM's word) that the user is legit
- [ ] Where the LLM(s) sit in the trust model — are they a security principal? (callback to "model proposes, code commits")
- [x] The different ways identity *could* propagate, and why some are dangerous

## 2. The Solution
- [x] The OAuth 2.1 "resource server" model: each MCP server independently validates a token
- [x] The shared **authorization server / IdP** as the trust anchor — why a common issuer is the whole trick
- [x] What's actually *in* a token (sub, aud, scope, iss, exp) and how a server verifies it (JWKS / introspection)
- [x] **Audience binding**: why a Billing token must be rejected by HR, and vice-versa
- [ ] Who holds the credentials — the host/client, not the model — and how the right token reaches the right server
- [ ] Per-server tokens vs. **token exchange (RFC 8693) / on-behalf-of** — when you need each
- [ ] Key tradeoffs: bearer vs. sender-constrained (DPoP/mTLS), token lifetime, scope granularity

## 3. The Bigger Picture
- [x] The **token passthrough** antipattern — why the MCP spec explicitly bans it (ties to confused deputy from 102)
- [ ] How this enforces least privilege across a mesh (callback to 104 zero-trust + namespacing)
- [ ] How it maps to a real multi-vertical mesh (the Neumo ~16-vertical decision)
- [ ] Failure modes: token theft/replay, confused deputy, over-broad scopes, stale tokens

### Distinctions nailed
- **authn** (who you are) vs **authz** (what you may do) vs **audience** (who the proof is addressed to) — three separate axes.
