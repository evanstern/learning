# MCP 102 — Presenter's Teaching Guide

Companion to `deck.html`. Same format as the 101 guide: an **opening line** to read, **talking points** for depth, **if asked** for grounded answers, and a **glossary** at the end.

**How to run the session:** ~45–55 min; it's denser than 101 and the back half is a security argument that builds. Run it *after* 101 — it leans on the host/client/server model and the self-describing-tools idea. The throughline is a single running example: a mesh of ~16 product verticals (Billing, CRM, Support, …) behind one agent. Keep returning to it.

---

## Slide 1 — Title

**Opening line:** "101 was why MCP exists. 102 is what breaks when you actually run it at scale — and how to defend by design."

**Talking points:** Flag the throughline up front: everything gets pressure-tested against a fictional 16-vertical mesh. Tell them the back half is a security story with a real payoff (a code example).

---

## Slide 2 — Recap

**Opening line:** "Three things from 101 we're about to build on." (Read the three.)

**Talking points:** The key bridge line is the callout: *the same self-describing, connect-everything design that makes MCP great is what creates 102's problems.* Every nice property has a bill.

---

## Slide 3 — Context cost

**Opening line:** "Connecting a server isn't free. At connect time, every server dumps its full tool catalog — names, descriptions, schemas — into the model's context, before a single tool is called."

**Talking points:**
- The model has to "hold the menu in its head" to know what it can do.
- This is a *standing* cost paid on every turn, not a one-time setup.

**If asked — "How big is a tool definition really?"** Easily 100–300+ tokens each with a real JSON schema. Multiply by hundreds of tools and you're spending tens of thousands of tokens before any work.

---

## Slide 4 — Token bloat & choice overload

**Opening line:** "Two failures fall out of that. One obvious, one sneaky."

**Talking points:**
- **Token bloat** (obvious): hundreds of tools = tens of thousands of tokens up front. Less room for the task, higher cost, more latency.
- **Choice overload** (sneaky): even if the window holds it, the model must pick one tool from a huge menu of near-duplicates (four `search`s, three `get_customer`s across verticals). Decision quality collapses.
- Land the punchline: "Token bloat is the cost you can see. Selection degradation is the one that quietly wrecks reliability."

**If asked — "Is choice overload real or hand-waving?"** It's observable: tool-selection accuracy degrades measurably as the candidate set grows and descriptions overlap. It's the same reason you'd struggle to pick from a 300-item menu.

---

## Slide 5 — The gateway / "librarian"

**Opening line:** "The fix people converge on: put a librarian in front of the mess."

**Talking points:**
- The **gateway** faces the host as *one* connection and exposes a tiny surface — essentially a `search_tools()` call.
- The model says "I need to refund a customer"; the gateway **semantically searches** all catalogs (tool RAG) and returns just the 2–3 relevant tools, which the model then calls.
- Context stays small, choices stay sharp. ~300 tools exist but none are loaded up front.
- Nice aside: *this very kind of session* uses deferred tools fetched via a search step — same pattern.

**If asked — "Is this part of the MCP spec?"** No — it's an architectural pattern you build (or adopt) on top of MCP. The spec gives you the uniform interface that makes a gateway feasible.

---

## Slide 6 — What the gateway costs you

**Opening line:** "Every fix buys a new failure surface. The gateway has three bills — and each has a known way to pay it."

**Talking points:**
- **Ownership burden (org):** someone must build/maintain it and keep it aware of every catalog. *Addressed by* running it as a platform product — vertical teams own their servers behind a contract; a platform/CoE team owns the gateway + a registry that auto-discovers catalogs.
- **Single point of failure (availability):** gateway down = all verticals unreachable; plus an extra hop. *Addressed by* standard distributed-systems hygiene — replicas/load balancing, health checks, timeouts & circuit breakers, cached catalogs, graceful degradation.
- **Silent mis-routing (correctness):** if search returns the wrong tools, the model can't recover because it never learns the right one existed. *Addressed by* treating the router like a model — eval sets, observability/logging, generous top-k, confidence fallback to a broader listing.
- The closing callout matters: these are known distributed-systems & MLOps playbooks. We flag the solution shape; the deep dives are their own session (MCP 103).

**If asked — "Doesn't a gateway re-introduce the choice problem?"** It *moves* it: the router now chooses which tools the model sees. That's why router evaluation (the correctness bullet) is non-optional.

---

## Slide 7 — Prompt injection via tool output

**Opening line:** "Now the heavyweight. Tool results flow back into context. A `get_ticket` call returns text typed by a customer — and that text can carry instructions."

**Talking points:**
- Read the example aloud: *"Disregard all previous instructions and…"*
- **Root cause:** data and instructions share one channel. The model reads its whole context as a single stream and can't reliably tell "content I fetched" from "commands to obey."
- Kill the false hope early: you can't fix this by adding "ignore malicious instructions" to the prompt — that's just more in-band text an attacker can talk over.

**If asked — "Why can't the model just be trained to resist?"** Detection-based defenses top out around 99%, and in security 99% is a failing grade — the attacker just needs the 1% that gets through. That's why 102 pivots to *containment* (slide 10).

---

## Slide 8 — The confused deputy / mesh amplifier

**Opening line:** "On a single app this is bad. On a mesh it's catastrophic, because the agent's effective privilege is the *union* of every tool it can reach."

**Talking points:**
- Through the gateway, the support-ticket reader can also touch Billing's `refund_customer` and CRM's `export_contacts`.
- Low-trust input (a box *any customer* can type into) + high-privilege reach = a single poisoned ticket pivoting to **effective root across the portfolio**.
- Name it: this is the classic **confused deputy** — a privileged agent tricked into misusing its authority.

**If asked — "What's a confused deputy, precisely?"** A program with legitimate privileges that's manipulated by a less-privileged party into misusing them on that party's behalf. Here, the attacker borrows the agent's authority.

---

## Slide 9 — Why RBAC doesn't touch this

**Opening line:** "The instinct is to reach for role-based access control. It doesn't bite here, and it's worth understanding why."

**Talking points:**
- **RBAC governs identity:** who you are, what you may do.
- **Injection is a provenance/integrity problem:** a fully-authorized agent is tricked by instructions laundered through data.
- The agent *has every right* to call `refund_customer`; it's just being told to by the wrong author. RBAC answers "*may* this agent?" not "*who really asked?*" Different axis.

**If asked — "So is RBAC useless?"** No — you still need it to scope *what* an agent can do (that's slide 11). It just can't, alone, distinguish a legitimate instruction from an injected one.

---

## Slide 10 — Containment > prevention

**Opening line:** "Here's the stance change. You can't reliably stop injection at the input, so stop trying to win that race. Constrain what a compromised agent can *do*."

**Talking points:** This is the philosophical hinge of the whole second half. Everything after is a containment technique. Say the mantra and let it land: **containment over prevention.**

---

## Slide 11 — Scope the agent · gate the action

**Opening line:** "Two levers that lower privilege."

**Talking points:**
- **Scoped, task-specific agents (no god-agent):** the agent that reads tickets simply *does not hold* `refund_customer`. Separation of duties. The dangerous union only exists if you build it.
- **Deterministic gates + caps:** the model can't call the dangerous tool directly; it proposes, and plain non-LLM code enforces the rule (`if amount > 50: deny/escalate`). **You can't prompt-inject an `if` statement** — that's the whole power.

**If asked — "Why is the gate safe but an LLM reviewer isn't?"** The gate has no judgment to manipulate. There's no "but it's an emergency" that moves a comparison operator. It keys off a fact the model can't author.

---

## Slide 12 — Human-in-the-loop, wired into orchestration

**Opening line:** "The cheapest, most effective circuit-breaker: the model *proposes*, a human *commits*."

**Talking points:**
- Compose it with the gate: auto-approve the safe bounded cases, escalate only the ambiguous ones to a human.
- In practice the gate is a **graph edge**: in LangGraph it's a *conditional edge* (plain code) choosing the next node; in n8n an *IF/Switch* node. Agents are nodes; the flow between them is code the model can't redraw.
- **Critical rule (read it):** branch on *structured, trusted state* (a computed amount), never on the model's free-text say-so — or the injection leaks back in one layer up.

**If asked — "Doesn't constant approval cause fatigue?"** Yes — "user fatigue" is a real CaMeL limitation. That's why you gate *only* high-risk actions deterministically and auto-clear the rest.

---

## Slide 13 — The dual-LLM (planner / executor) pattern

**Opening line:** "The architectural quarantine. Two models with very different jobs."

**Talking points:**
- **Privileged LLM (planner):** drives the tools and writes the plan from the *trusted request only*; **never sees untrusted prose**. (It *proposes* privileged actions — it doesn't get to fire them directly; the gate still authorizes. "Model proposes, code commits.")
- **Quarantined LLM (parser):** has *no tools*; reads the messy prose and emits only **typed data to a schema**. Can describe, can't act.
- The returned data is **tainted**, flows through the **deterministic policy engine**, and only then does a tool run (or escalate).
- One-liner to land: "Poisoned prose reaches the parser, never the planner or the hands. Instructions can't ride inside a typed number."

**If asked — "Origin?"** The dual-LLM pattern is Simon Willison's (2023); CaMeL (DeepMind, 2025) fixes a flaw in it with capabilities + a custom interpreter (slides 18–19).

---

## Slide 14 — Trace the attack

**Opening line:** "Let's walk the `refund $9,999` attack through and watch it die."

**Talking points:**
- It reaches only the quarantined parser — the planner never gets it as text. So it can't *command* anything.
- Worst case: it produces a bad *value* (`amount: 9999`), arriving **tainted**.
- That value hits the deterministic policy engine: `9999 > cap → deny/escalate`.
- Key property: **a fooled LLM can produce a bad value, never a bad action** — because actions are gated by code. Blast radius is bounded by your policy, not by how gullible the model is.

---

## Slide 15 — Taint tracking = information-flow control

**Opening line:** "The mechanism underneath. It's an old security idea."

**Talking points:**
- **Sources are labeled at design time:** a tool's definition declares its trust level (`get_ticket` untrusted; `get_balance` trusted).
- **The harness tags at the boundary:** data crossing in from an untrusted source is stamped `tainted` automatically — no LLM judgment.
- **Taint is sticky:** anything derived from tainted data inherits the tag (summarize it, extract a field, concatenate it — still tainted). A value is trusted only if *every* input that fed it was trusted.
- This is the same technique used to trace untrusted input for SQL-injection / XSS, ported onto LLM data flow.

**If asked — "Who decides what's untrusted?"** A human, at design time, in config (next slide). That decision is the soft spot.

---

## Slide 16 — Provenance routing (how the planner knows to quarantine)

**Opening line:** "Natural question: how does the planner *know* to send something to the quarantined model? Answer: it doesn't decide — provenance does."

**Talking points:**
- If the planner had to *judge* "this looks untrusted," that judgment is exactly what injection targets. So the decision is taken away from the LLM.
- Routing is a *consequence of the taint tag*, enforced as the plan runs.
- **Define "the executor"** (the term to nail): the deterministic runtime — plain code in the trusted orchestration layer, the same place the policy engine lives — that runs the planner's emitted plan, carries taint per value, and gates each step. *Not* an LLM. In LangGraph terms, it's the graph executor.
- The one human decision is *which sources are untrusted*. Mislabel one and the machine faithfully ignores a hole.

---

## Slide 17 — "Trusted" ≠ "safe"

**Opening line:** "A subtlety that trips everyone: 'trusted' does not mean 'safe.'"

**Talking points:**
- **Trusted = the principal** whose authority the system acts under — bounded by *their own* permissions. Your authenticated request goes straight to the planner. That's correct.
- Injection is the crime of a **non-principal** (a ticket author) smuggling directives through data to **borrow your authority**.
- Governing principle (read it): **an agent must never hold privileges greater than the trust level of whoever can drive it.**

**If asked — "So is the user a vulnerability?"** No — the user is the principal, scoped to their own permissions. The danger is a third party riding that channel. "Trusted" means "this is whose authority we act under," not "this can do anything."

---

## Slide 18 — Default-deny by capability (the crux)

**Opening line:** "How does the policy engine actually 'catch the red flags'? It doesn't — and that's the point."

**Talking points:**
- Don't enumerate "all the bad things" — that's the **blocklist trap**, the same losing game as detecting every injection.
- Flip it: **allowlist**. Ask "is this exact action, with data of this provenance, explicitly permitted?" If not → denied.
- **Security boundary = completeness of the allowlist**, not cleverness of a detector. Default-deny is tractable; "detect all evil" is not.
- This is **capability-based security**, and the headline idea in DeepMind's **CaMeL** ("CApabilities for MachinE Learning") — defeat injection with classic software security, not more AI.

---

## Slide 19 — A CaMeL-style plan (the code)

**Opening line:** "Here's what the plan actually looks like — and an important clarification."

**Talking points:**
- Walk the code: `get_ticket` (tainted) → `query_quarantined_llm(..., output_schema=RefundRequest)` (Q-LLM, no tools) → `issue_refund(...)` with a tainted `amount`.
- The policies (right side) are enforced *per call* by the executor; `issue_refund` only runs if `amount ≤ 50` and the order belongs to the ticket's customer, else it escalates.
- **Clarify (people will ask):** this is **not** a new language. CaMeL uses a *locked-down subset of ordinary Python* (parsed via Python's `ast`). There is no "CaMeL script." The safety is in the custom interpreter + capabilities, not the syntax.

**If asked — "Could the model just write malicious Python?"** The interpreter only exposes safe builtins and gates every tool call by its arguments' capabilities, so injected code can't break out or call tools with disallowed (tainted) arguments.

---

## Slide 20 — Mesh-scale design (open questions for ~16 verticals)

**Opening line:** "Bringing it home to our mesh. These are the open design questions."

**Talking points:**
- **Granularity:** one server per vertical? per capability? per domain? ("16" may be the wrong number.)
- **Taming many servers:** gateway + tool search, **namespacing** to avoid tool-name collisions, a registry.
- **Orchestration & trust:** where do cross-vertical workflows live, and how is provenance tracked across them?
- **Conway's Law:** the ownership model is the real constraint — central platform team vs. each vertical owning its server, with the MCP contract as the team boundary.

**If asked — "Where do we start?"** Usually a single high-value "wedge" vertical proves the pattern before you build all of them.

---

## Slide 21 — Key takeaways

**Opening line:** "Five things to leave with." (Read them.)

**Talking points:** Check comprehension by asking the room to explain *why RBAC misses* and *why containment beats prevention* in their own words — those two are the keystones.

---

## Slide 22 — Further reading

**Opening line:** "Where to go deeper."

**Talking points:** The CaMeL paper ("Defeating Prompt Injections by Design," arXiv:2503.18813), Simon Willison's CaMeL and dual-LLM writeups, and the MCP spec's lifecycle/transport sections. Mention the in-house follow-ons: a dedicated CaMeL session and a LangGraph gate demo.

---

## Glossary

- **Context cost:** the tokens consumed by tool definitions loaded into the model's context at connect time, paid on every turn.
- **Token bloat:** degradation from too many tool schemas occupying the context window (cost, latency, less room for the task).
- **Choice overload:** drop in tool-selection accuracy when the model must choose among many similar tools.
- **Gateway (MCP gateway / proxy):** a layer that fronts many servers as one connection and exposes a small surface (e.g., tool search) to the host.
- **Tool RAG / tool search:** retrieving only the relevant tools for a request via semantic search, instead of loading every tool up front.
- **Namespacing:** prefixing tool names by server/vertical to avoid collisions across a mesh.
- **Prompt injection (via tool output):** untrusted content returned by a tool that contains instructions the model may follow, because data and instructions share one channel.
- **Confused deputy:** a privileged component manipulated by a less-privileged party into misusing its authority.
- **Effective privilege:** the union of all tools/actions an agent can reach — its real blast radius if compromised.
- **RBAC (role-based access control):** permissions based on identity/role; governs "may this actor act," not "who really issued this instruction."
- **Provenance:** where a piece of data came from; the basis for trust decisions and taint.
- **Taint tracking / information-flow control:** tagging untrusted data and propagating the tag through everything derived from it; classic technique against SQL-injection/XSS.
- **Containment > prevention:** the stance of limiting what a compromised agent can do rather than trying to perfectly block bad input.
- **Scoped (task-specific) agent:** an agent granted only the tools its job needs — no "god-agent" holding everything.
- **Deterministic gate:** plain, non-LLM code enforcing a rule (e.g., an amount cap) that injection cannot manipulate.
- **Human-in-the-loop:** requiring human approval to commit a privileged action the model proposed.
- **Conditional edge (LangGraph) / IF-Switch (n8n):** the code-defined routing in an orchestration graph where deterministic gates live.
- **Dual-LLM pattern:** a privileged planner (holds tools, sees only trusted input) plus a quarantined parser (no tools, handles untrusted content).
- **Privileged LLM (planner / P-LLM):** writes the plan from the trusted request and drives tools; never sees untrusted prose.
- **Quarantined LLM (parser / Q-LLM):** tool-less model that converts untrusted content into typed, schema-constrained data.
- **Executor (runtime):** deterministic code in the trusted layer that runs the planner's plan, tracks taint, and enforces policies per step. Not an LLM.
- **Policy engine:** the deterministic component that allows/denies each action based on capabilities and the provenance of its arguments.
- **Capability-based security:** granting actions only via explicit, unforgeable permissions; the basis of default-deny.
- **Default-deny / allowlist:** permit only explicitly approved actions; deny everything else. (Opposite of the blocklist trap.)
- **Blocklist trap:** trying to enumerate all bad inputs/actions — unwinnable, like trying to detect every injection.
- **CaMeL ("CApabilities for MachinE Learning"):** DeepMind's injection defense: dual-LLM + a custom interpreter over restricted Python + capability/taint policies. A *system*, not a language.
- **Output schema:** the typed structure (e.g., a Pydantic model) the quarantined LLM must emit, so untrusted prose becomes inert data.
