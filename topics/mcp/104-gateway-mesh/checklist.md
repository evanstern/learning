# Understanding Checklist: MCP 104 — Gateway & Mesh Operations

Calibrated for Evan (expert; builds MCP servers, ran an agency). Go deep, skip basics.
Throughline: operating a real mesh of Neumo's ~16 verticals behind a gateway.
Picks up exactly where 102 stopped: the gateway exists, and it has 3 costs
(ownership, single-point-of-failure, silent mis-routing).

### 1. Granularity & boundaries
- [x] Server-per-vertical vs per-capability vs per-domain — what drives the cut? → the cut IS a least-privilege boundary; per-vertical bundles mixed trust into one bindable unit → recreates the god-agent/union-of-privileges problem at packaging time. Cut by capability/task so agents bind only what they need.
- [x] Tool-name collisions across verticals; namespacing → flat catalog → duplicate names silently shadow (last-wins, tool vanishes) or model mis-selects. Fix: namespace by server/vertical (billing.search); prefix also encodes ownership.
- [x] The registry: how the gateway discovers & versions catalogs → MCP discovers TOOLS within a known server (tools/list + list_changed notification), but NOT servers. Discovering that a server exists = your registry/control-plane job (config/service discovery). Schema drift danger = silent change; needs versioning + a reviewed contract.

### 2. Availability & performance (the SPOF cost, paid down)
- [x] Why the gateway is now critical-path infra; blast radius of an outage → centralization converts INDEPENDENT failures into one CORRELATED failure; gateway sits in the hot path of all 16, so its outage = full-mesh outage (even healthy verticals go dark). "Mothership falls, swarm goes dark."
- [x] Replication / statelessness, health checks, timeouts, circuit breakers → N stateless gateways behind a LB kills the SPOF. The trap: a SLOW vertical exhausts the gateway pool → recreates full-mesh outage. Timeouts + circuit breakers + bulkheads (per-vertical concurrency caps) RESTORE fault isolation at the gateway layer.
- [x] Caching catalogs; graceful degradation (cached / direct fallback) → return a clean expected error for a dead vertical so the agent routes around it; serve catalogs from cache when a vertical is down.
- [x] The extra hop: latency budget, streaming, connection pooling → added nodes/edges = inherent latency + a fault point. Levers: connection pooling/keep-alive, streaming passthrough (no buffering), co-location. Nugget: the NETWORK hop is cheap; the gateway's own per-request semantic tool-search is the costly part → cache/precompute routing.

### 3. Router quality (the silent mis-routing cost, paid down)
- [x] Why tool-search is an ML component you must evaluate → mis-routing is SILENT (healthy-but-wrong): passes every availability/health check while returning wrong/omitted tools. Worst case = right tool omitted, model can't recover. Availability monitoring ≠ correctness monitoring.
- [x] Eval sets, offline benchmarks, top-k, confidence fallback → curated queries + known-correct tools; measure a RATE (recall@k), not pass/fail; run as a regression gate on every router/embedding change or new vertical; generous top-k + confidence fallback to a broader listing.
- [x] Observability: tracing what was offered vs chosen vs called → log query → candidates → chosen → outcome; spot drift; mine real misses to grow the eval set (living asset).

### 4. Ownership & governance (Conway's Law)
- [x] Central platform team vs each vertical owning its server → NOT either/or. Scarce knowledge = the domain, not MCP ("easier to teach them MCP than learn billing"). Push impl to vertical teams (domain experts); central team PAVES THE ROAD (SDK/template, gateway, registry, eval harness, namespacing + schema standards, the 102/103 security library as defaults). Decentralizing REQUIRES governance or you get 16 incompatible styles.
- [x] The MCP contract as the team boundary; schema/versioning standards → Conway's Law turned intentional: the MCP interface IS the explicit, versioned contract between teams.
- [x] Trust & auth across verticals → ZERO TRUST: gateway is not a trust anchor ("could be a fake mothership"). Danger of god-cred gateway: total-compromise SPOF + destroys least-privilege (rebuilds union/confused-deputy). Right design: (1) identity propagation / on-behalf-of (authorize against the end principal, not the gateway), (2) narrow per-vertical scopes, (3) each vertical enforces its own authz. Effective power = INTERSECTION of (principal may) ∩ (vertical permits), enforced at the vertical.

### 5. Bringing it home
- [x] A migration path for Neumo: wedge-first, not all 16 at once → the gateway is a SCALING solution, not a starting point (earns its keep only when many servers → context bloat). Start with ONE painful cross-vertical workflow, build only the tools it needs, wire straight to one agent (no gateway/registry/router yet), ship it, measure time/$ saved → that's the evidence to fund more. Add gateway later when server count demands it.
- [x] What "done/good" looks like; when NOT to build the mesh → NOT just build capital but PERPETUAL run cost (a half-maintained mesh is worse than none). Also don't build if: no real cross-vertical demand (point-to-point wins), not enough scale (gateway only pays off with many servers), or org can't own servers (Conway bottleneck). Test: if you can't name a painful, repeated, cross-vertical workflow with real ROI, you don't have a reason yet — don't build for an imagined future.
