# MCP 104 — Presenter's Teaching Guide

Companion to `deck.html`. Same format as 101–103: an **opening line** to read, **talking points**, **if asked**, and a **glossary** at the end.

**How to run the session:** ~45 min. This is the operations/maturity capstone — it assumes 101 (the protocol), 102 (failure modes & defense), and ideally 103 (the working demo). The audience for 104 skews senior: platform, infra, and eng leads, because half of it is org design, not code. Keep returning to the running example: a mesh of Neumo's ~16 product verticals.

**The spine of the lecture:** 102 introduced the gateway and left three unpaid bills — ownership, single-point-of-failure, silent mis-routing. 104 pays each down, then asks the adult question: should you build this at all?

---

## Slide 1 — Title

**Opening line:** "101 through 103 were about the protocol and a single agent. 104 is what changes when you run *many* servers in production — and most of it is distributed-systems and org design, not MCP."

**Talking points:** Set the senior frame; flag that the final slide is "when *not* to build it," so this isn't a sales pitch for the mesh.

---

## Slide 2 — Recap: three unpaid bills

**Opening line:** "The gateway from 102 solved context bloat, but it shipped with three IOUs. Today we pay them."

**Talking points:** Ownership (who maintains it), availability (one door = total blast radius), correctness (silent mis-routing). The rest of the deck is literally these three, plus granularity up front and migration at the end.

---

## Slide 3 — Granularity is a least-privilege boundary

**Opening line:** "Before any of that: how do you carve 16 verticals into servers? The naive cut — one server per vertical — quietly throws away least-privilege."

**Talking points:**
- Walk the diagram: Cut A's Billing server holds `get_invoice` *and* `issue_refund`, so any agent that wants the read is forced to hold the money-mover too.
- That recreates the **god-agent / union-of-privileges** problem from 102/103 — but at *packaging time*, before any code runs.
- Cut B splits by capability/task so an agent binds only the slice it needs.

**If asked — "Isn't one-per-vertical simpler to operate?"** Marginally, at first. But it forces every consuming agent to over-privilege, and it bundles wildly different risk classes into one deploy/release unit. The simplicity is a mirage you pay for in security.

---

## Slide 4 — Trust-homogeneous

**Opening line:** "Here's the elegant payoff of cutting by capability: each server becomes trust-homogeneous."

**Talking points:** "Bind `billing-refunds`" now *means* "grant one trust tier," because everything inside is the same risk class. The packaging unit and the trust boundary line up. It also makes ownership and gating cleaner downstream.

---

## Slide 5 — Collisions & namespacing

**Opening line:** "Billing, CRM, and Shipping each named a tool `search`. What happens when they all hit the gateway's catalog?"

**Talking points:**
- The non-obvious danger: a naive gateway **silently shadows** one with another (last-registered wins). A whole tool becomes invisibly unreachable — *no error*. Best case, the model mis-selects between look-alikes.
- Fix: **namespace by server** (`billing.search`). Uniqueness + a disambiguating signal, and the prefix encodes ownership.

**If asked — "Won't good descriptions handle disambiguation?"** They help the model choose, but they don't prevent the registry-level collision/shadowing. Namespacing fixes the identity problem; descriptions help the selection problem (slide 11's territory).

---

## Slide 6 — The registry: MCP discovers tools, not servers

**Opening line:** "We keep saying 'the gateway knows the catalogs.' How? And here's the gap people miss."

**Talking points:**
- The handshake (`tools/list` + `notifications/tools/list_changed`) tells the gateway what an *already-connected* server offers.
- It never tells the gateway a **new server exists**. That's a registry/control-plane job — config or service discovery — which you build and run. *The protocol gives you the calling, not the directory.*
- The registry also owns versioning + a reviewed contract; the real danger is **silent schema drift** breaking live agents.

**If asked — "Is there a standard MCP registry?"** Treat server discovery/registration as your operational concern regardless — config, a service registry, or a control plane. Don't assume the protocol solves it.

---

## Slide 7 — Availability: correlated failure

**Opening line:** "Now the scary one. Before the gateway, a Billing crash cost you Billing. After it?"

**Talking points:**
- The gateway sits in the hot path of all 16, so one hiccup makes *every* vertical unreachable — even the healthy ones.
- The concept to name: you **converted independent failures into one correlated failure.** Centralization bought portability and paid in blast radius.
- (The room's analogy from the live session: "the mothership falls and the swarm goes dark.")

---

## Slide 8 — Hardening (the slow vertical is the trap)

**Opening line:** "You harden it like any critical-path service — but there's a trap most people miss."

**Talking points:**
- Kill the SPOF: N **stateless** gateway replicas behind a load balancer + health checks.
- The trap: a *slow* vertical (not cleanly down) is more dangerous than a crashed one — slow calls pile up and **exhaust the gateway's pool**, taking the whole gateway down. That recreates the full-mesh outage from one sick drone.
- The fix is fault isolation at the gateway: **timeouts** (never block forever), **circuit breakers** (fail fast after repeated failures), **bulkheads** (cap concurrency per vertical). Plus cached catalogs + clean error responses so agents route around.
- Punchline: those three **give back the independence centralization took away.**

**If asked — "Stateless how?"** No per-request state stored in the gateway instance; push session/cache state to a shared store (Redis, etc.) so any replica can serve any request.

---

## Slide 9 — The extra hop

**Opening line:** "Every call now takes an extra hop. Where's the real cost?"

**Talking points:**
- Network levers: connection pooling/keep-alive, streaming passthrough (don't buffer), co-location.
- The nugget: the **network hop is usually cheap**; the gateway's *own* per-request work — especially a semantic tool-search on every call — is what dominates. Biggest win: **cache/precompute the routing**.

---

## Slide 10 — Silent mis-routing

**Opening line:** "Router quality. The gateway's tool-search picks which 2–3 tools the model even sees — so it's an ML component, not plumbing."

**Talking points:**
- A crash is **loud** (error, alert, you know). Mis-routing is **silent**: 200 OK, fast, tidy — and wrong, or the right tool *omitted* so the model can't recover.
- It passes every availability/health check while being wrong. That's what makes it the nastiest of the three bills.

**If asked — "Doesn't the 103 gate protect us if it routes to a privileged tool?"** Yes — being *shown* a tool isn't being *allowed* to use it; the deterministic gate still guards privileged actions. So mis-routing's damage is correctness (wrong/missing outcomes), not privilege escalation.

---

## Slide 11 — Evaluate the router like a model

**Opening line:** "If errors won't tell you it's broken, how do you find out? You evaluate it like a model, not like code."

**Talking points:**
- **Eval set:** representative queries paired with the tool(s) that should win.
- **Measure a rate, not pass/fail:** did the right tool land in the top-k (recall@k)? It's a ranker.
- **Regression gate:** re-run on every router/embedding change *or new vertical* — adding servers can quietly degrade routing.
- **Observability:** log `query → candidates → chosen → outcome`; mine real misses; feed them back (living eval set).
- Land it: **health checks answer "is it up?", never "is it right?"**

---

## Slide 12 — Ownership: pave the road

**Opening line:** "Who builds the 16 servers? Not one central team — and the reason is sharper than 'bottleneck.'"

**Talking points:**
- The scarce knowledge is **the domain, not MCP**. "Easier to teach the Billing team MCP than to teach the platform team Billing." Push implementation to domain experts.
- The central/platform team's real job: **pave the road** — MCP SDK/template, namespacing + schema standards, the gateway, registry, eval harness, and the 102/103 security library (taint + gate) as drop-in defaults.
- Decentralizing **requires** that governance, or you get 16 incompatible styles.

**If asked — "Isn't that more coordination overhead?"** It's *bounded* coordination: teams coordinate on the contract and the paved-road standards, not on each other's internals. That's cheaper than one team learning 16 domains.

---

## Slide 13 — The MCP contract is the team boundary

**Opening line:** "Conway's Law says the architecture will mirror your org whether you plan it or not — so plan it."

**Talking points:** Make the split deliberate: vertical teams own their servers, platform owns the road, and the **versioned MCP schema is the explicit handshake between them.** A clean, reviewable contract instead of an accidental one.

---

## Slide 14 — Zero-trust auth across verticals

**Opening line:** "An agent spans CRM and Billing in one workflow. Whose permissions decide what it can do? Not the gateway's."

**Talking points:**
- **Don't** give the gateway god credentials: (1) it becomes a single point of *total* compromise; (2) every vertical sees one omnipotent caller — least-privilege gone, confused-deputy rebuilt inside the gateway.
- **Do:** identity propagation / on-behalf-of (authorize against the end principal, not the gateway), narrow **per-vertical scopes**, and **each vertical enforces its own authz** ("never trust 'the gateway said so'").
- Effective power = (what the principal may do) ∩ (what each vertical permits), enforced *at the vertical*.

**If asked — "Isn't propagating identity a lot of plumbing?"** Yes — OAuth token-exchange / on-behalf-of flows. It's the cost of not having a god-credential SPOF. Worth it the first time the gateway is breached.

---

## Slide 15 — Migration: the gateway is a scaling tool

**Opening line:** "You do not build a gateway plus 16 servers on day one. The gateway only earns its complexity once *many* servers cause context bloat."

**Talking points:**
- With 2–3 servers, an agent connects directly — no gateway needed.
- Wedge in: one **painful cross-vertical workflow** a human does by hand today → build only the tools it needs (capability cut) → wire straight to one agent → ship → **measure time/$ saved**. That's the evidence to fund the rest.
- Add the gateway/registry/router *later*, when server count demands it.

---

## Slide 16 — When NOT to build the mesh

**Opening line:** "The adult question. When is this whole thing the wrong investment?"

**Talking points:**
- Can't fund the **run** cost (not just the build) — a half-maintained mesh is worse than none.
- No real cross-vertical demand — point-to-point integrations win.
- Not enough scale — the gateway is pure complexity tax below a threshold.
- Org can't own servers — back to the central bottleneck.
- The test: **if you can't name a painful, repeated, cross-vertical workflow with real ROI, you don't have a reason yet.**

---

## Slide 17 — Takeaways

**Opening line:** "Five to leave with." (Read them.)

**Talking points:** Pressure-test by asking the room to explain *why a slow vertical is worse than a dead one* and *why per-vertical granularity hurts security* — those two are the keepers.

---

## Slide 18 — End of series

**Opening line:** "101 to 104: why MCP exists, how it fails and how to defend, a working secure agent, and operating it at mesh scale."

**Talking points:** The audience can now reason about an agent platform from the protocol up to the org chart. Point them at the decks, guides, and the 103 demo as reference — and at the **capstone** (`topics/mcp/capstone/`), a two-server secure mini-mesh that ties 101–104 together in one runnable cross-vertical workflow. The whole map lives in `topics/mcp/SERIES.md`.

---

## Glossary (104-specific; see 101–103 guides for protocol, taint, dual-LLM, gate, etc.)

- **Mesh:** the fabric of many MCP servers (the verticals) + the gateway/registry connecting them + the agents that orchestrate across them.
- **Granularity (server cut):** how a vertical's surface is split into MCP servers — per-vertical, per-capability, or per-domain. It's a least-privilege boundary.
- **Trust-homogeneous server:** a server whose tools are all the same risk class, so binding it grants exactly one trust tier.
- **Namespacing:** prefixing tool names by server/vertical (`billing.search`) to prevent collisions and encode ownership.
- **Tool shadowing:** when duplicate tool names cause one to silently overwrite another in the catalog (last-registered wins), making a tool invisibly unreachable.
- **Registry / control plane:** the maintained directory of which servers exist, where to reach them, their owners, trust levels, and versions. You build and run it; MCP doesn't provide it.
- **`tools/list` / `list_changed`:** the protocol mechanisms for discovering and refreshing the tools of an already-connected server.
- **Schema drift:** a tool's input/output schema changing over time; dangerous when silent, because it breaks live agents.
- **Correlated failure:** a failure of a shared dependency (the gateway) that takes down many otherwise-independent components at once.
- **Single point of failure (SPOF):** a component whose failure brings down the whole system; the gateway, unhardened.
- **Stateless (gateway):** holding no per-request state locally, so any replica can serve any request — the enabler for horizontal replication.
- **Timeout / circuit breaker / bulkhead:** fault-isolation patterns. Timeout bounds waiting; circuit breaker fails fast after repeated failures; bulkhead caps concurrency per dependency so one can't exhaust shared capacity.
- **Graceful degradation:** returning a clean, expected error (or cached data) when a dependency is down, so the rest keeps working.
- **Tool-search / router:** the (often semantic) component that selects which tools to surface for a request — an ML component requiring evaluation.
- **recall@k:** the fraction of cases where the correct tool appears in the router's top-k results; the core router-quality metric.
- **Eval set:** curated queries with known-correct answers, used to measure and regression-test the router.
- **Conway's Law:** organizations produce systems that mirror their communication structure; here, team ownership shapes the server boundaries.
- **Pave the road:** the platform-team model where the center provides SDKs, standards, gateway, registry, eval, and security defaults, while feature teams build on them.
- **Zero trust:** never trusting a component by position; every vertical authenticates and authorizes each request independently.
- **Identity propagation / on-behalf-of:** passing the end principal's identity through the gateway so each vertical authorizes against the real user, not the gateway.
- **Per-vertical scopes:** narrow, capability-limited credentials per vertical (read-only here, refund-only there) instead of a blanket pass.
- **Wedge:** the smallest valuable first build — one painful cross-vertical workflow, minimal tools, no gateway yet — used to prove ROI before committing to the mesh.
