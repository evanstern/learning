# MCP 101 — Presenter's Teaching Guide

Companion to `deck.html`. For each slide you get an **opening line** (read it aloud to get rolling), **talking points** (extra depth to riff on), and **if asked** (grounded answers to likely questions). A full **glossary** is at the end.

**How to run the session:** advance with arrow keys / space. Aim for ~30–40 min. The deck is built so people can also scan it solo, so don't just read it — use the talking points to add the color that isn't on the slide. Encourage questions; the "if asked" notes have you covered.

---

## Slide 1 — Title

**Opening line:** "This is part one of two. Today is the *why* and the *shape* of MCP — what problem it solves and how the pieces fit. Part two is where it breaks and how to defend it."

**Talking points:**
- Set expectations: 101 is conceptual, not a coding tutorial. Nobody needs a laptop open.
- MCP = Model Context Protocol. Anthropic introduced it in late 2024; it's since been widely adopted across tools.

---

## Slide 2 — What is MCP (the one-liner)

**Opening line:** "In one sentence: MCP is a standard protocol that lets any LLM app talk to any tool or data source — the USB-C of AI applications."

**Talking points:**
- The USB-C analogy does a lot of work: one connector spec means you don't build a custom cable for every device pair.
- Stress the word **standard**. The value isn't a clever feature; it's *agreement* — everyone speaking the same protocol.

**If asked — "Isn't this just function calling?"** Function calling lets *one* model invoke *one* app's hand-wired tools. MCP standardizes the interface so the tool and the app can be built by different parties who never coordinate. (We unpack this on slides 3–4.)

---

## Slide 3 — The problem

**Opening line:** "Before a standard, every tool integration was bespoke glue. You *could* wire tools into a model already — so why did we need a protocol?"

**Talking points:**
- The pain is **re-implementation**: each app integrated each tool its own way, and everyone kept rebuilding the same connections.
- The quote — "I like what your tool *does*, but I have to re-translate *how* it does it" — is the emotional core. Portability is the cure.
- Analogy worth dropping: this is exactly why we standardized USB, HTTP, and LSP (the Language Server Protocol that fixed the editor-×-language explosion).

**If asked — "Why didn't existing API standards (REST/OpenAPI) solve this?"** They describe APIs for *developers* to read and integrate. MCP is designed for a *model* to discover and use tools at runtime — different consumer, different needs (slide 5).

---

## Slide 4 — M×N → M+N

**Opening line:** "Here's why a standard matters mathematically. M clients times N tools means everyone builds a custom integration with everyone."

**Talking points:**
- Left: 3 clients × 3 tools = 9 bespoke integrations. Add a 4th tool and every client must build it again.
- Right: with MCP in the middle, it's 3 + 3 = 6, and each is built *once*.
- The punchline is the complexity class: **O(n²) → O(n)**. Quadratic cost kills ecosystems; linear cost lets them grow. "That gap *is* portability."

**If asked — "Is MCP literally a hub/proxy in the middle?"** Not necessarily a running server — it's a *shared protocol*. Each side implements MCP once. (A gateway that physically sits in the middle is a 102 topic.)

---

## Slide 5 — Why now (the deep reason)

**Opening line:** "O(n²) integration pain isn't new — drivers and plugins always had it. So why did *this* standard erupt for LLMs specifically? Because the 'client' stopped being a developer and became the model."

**Talking points:**
- Old world: a human wires a known integration once, documents it, done. Ad-hoc is fine.
- New world: an autonomous model does "everything everywhere," so you can't hand-script every path in advance.
- Consequence: tools must **describe themselves** — names, descriptions, JSON schemas the *model* reads at runtime to decide what to call.
- This is the load-bearing insight of 101. If people only remember one thing, make it this.

**If asked — "Who writes those descriptions?"** The tool/server author. And yes — they're effectively prompts the model reads, which becomes a security surface in 102.

---

## Slide 6 — Three primitives

**Opening line:** "These are three kinds of capability an MCP *server* exposes — and the distinction is *who triggers each*."

**Talking points:**
- Stress up front: **tools, resources, and prompts are all things the server advertises** (each has its own protocol calls). The split is purely about who, on the client side, pulls each into the conversation.
- **Tools** = model-controlled. Server lists them; the **model** decides to call one (`tools/list` / `tools/call`). Actions, side effects.
- **Resources** = app-controlled. Server lists readable data; the **host application** decides what to read into context (`resources/list` / `resources/read`) — not the model, not (necessarily) the user.
- **Prompts** = user-controlled. Server lists templates; the **user** fires one (`prompts/list` / `prompts/get`) — a slash command like `/review-pr`.
- The clincher: **one server can expose all three.** A filesystem server might offer your files as *resources* (the app reads them), `write_file` as a *tool* (the model calls it), and `/summarize` as a *prompt* (the user fires it).

**If asked — "How is a 'resource' an MCP thing vs. generic app context?"** It's a first-class server capability with its own methods (`resources/list` / `resources/read`). The server *offers* readable data; the protocol deliberately hands the *decision to read it* to the host application — that's what "app-controlled" means. (Contrast: a tool would let the *model* fetch it autonomously.)

**If asked — "A resource could just be a `read_file` tool, right?"** Yes, and many servers do that. The distinction MCP preserves is *who triggers it*: a resource is read by the app; a tool is called by the model. Same bytes, different controller.

---

## Slide 7 — Architecture (host / client / server)

**Opening line:** "Three roles. The one thing to anchor on: the LLM lives in the *host*."

**Talking points:**
- **Host** = the app the user runs (Claude Code, Cursor, coda-lite). Holds the LLM *and* the trust/permission decisions.
- **Client** = a connector *inside* the host; the host spins up **one client per server** it connects to. It speaks the MCP protocol.
- **Server** = your code; holds tools + data; **never talks to the model**.
- Trace the flow on the slide: model → (host relays) → client → server → back.

**If asked — "Is the client something I write?"** No — it's part of the host's MCP implementation. You write *servers*. The host provides the clients.

---

## Slide 8 — The split (the server is "dumb" on purpose)

**Opening line:** "The server having no idea a model exists isn't a limitation — it's the whole point."

**Talking points:**
- Because the server is model-agnostic, it's **portable across any host**.
- Because the model can only reach a server through the host's relay, the **host stays the single chokepoint** for trust and permissions.
- Tease 102: "That boundary is what we turn into a security story next time."

**If asked — "What stops a server from doing something malicious?"** The host mediates every call and the server runs as its own isolated process. We go deep on this in 102 (the server's *output* is the real risk surface).

---

## Slide 9 — Transports

**Opening line:** "Two ways to connect, same protocol riding on top."

**Talking points:**
- **stdio** — host launches the server as a subprocess; they talk over stdin/stdout. Local. (Your `focus`, `the-stacks`.)
- **streamable HTTP** — server runs elsewhere; POST + SSE stream. Remote / multi-user. Hosted connectors.
- Both carry **JSON-RPC 2.0** messages. The transport is just the pipe; the protocol is the language.

**If asked — "Which should I use?"** Local/personal tools → stdio (simplest, no network). Shared/hosted/multi-user → HTTP.

---

## Slide 10 — Lifecycle

**Opening line:** "Every connection follows the same arc: initialize, negotiate, operate, shut down."

**Talking points:**
- `initialize` handshake: both sides announce version and **capabilities**.
- Operate loop: `tools/list` (client asks "what've you got?" and gets the self-describing catalog) and `tools/call` (model picked one → server runs it → result).
- Point out that `tools/list` is *how* the runtime discovery from slide 5 actually happens.

**If asked — "Does the model see every tool every time?"** Yes — the catalog goes into context at connect. That's free in 101's small examples and a real problem at scale (the very first topic of 102).

---

## Slide 11 — Capability negotiation

**Opening line:** "This handshake detail is the most important design decision in the whole protocol. It's what lets the ecosystem survive."

**Talking points:**
- Features (resources, prompts, sampling…) are **optional**, used only if both sides negotiated them.
- So a new client can talk to an old server and vice versa; both **degrade gracefully** instead of crashing on an unknown method.
- The real win: **client teams and server teams upgrade on independent schedules.** No "flag day" where everyone must upgrade at once. For thousands of independently-owned servers, that's survival. Same trick browsers use to evolve HTTP.

**If asked — "Who are these 'teams'?"** Literally different orgs: GitHub maintains its server, you maintain yours, Anthropic maintains the host. None coordinate releases — negotiation is what makes that safe.

---

## Slide 12 — Mental model (one slide)

**Opening line:** "If you compress all of it: MCP is a self-describing, negotiated contract between a model-driven host and dumb, portable servers."

**Talking points:**
- Tools self-describe so the **model** chooses them at runtime.
- The **host** holds the brain and the trust.
- **Servers** stay ignorant of the model so they plug in anywhere.
- Good place to pause and take questions before the recap.

---

## Slide 13 — Key takeaways

**Opening line:** "Five things to walk out with." (Then read them.)

**Talking points:** Use this as a check — ask the room to explain *why now* (slide 5) and *why capability negotiation matters* (slide 11) in their own words. Those two are the ones people under-absorb.

---

## Slide 14 — Up next (102)

**Opening line:** "101 was why it exists. 102 is what happens when you wire 16 of these together and someone hostile sends you a message."

**Talking points:** Seed curiosity: token bloat, choice overload, gateways, prompt injection, the confused-deputy problem, and defense by design.

---

## Glossary

- **MCP (Model Context Protocol):** an open standard for connecting LLM applications to external tools and data through a uniform interface.
- **Host:** the application that runs the LLM and embeds MCP clients (e.g., Claude Code). Owns trust and permission decisions.
- **Client:** a connector inside the host, one per server, that speaks the MCP protocol over a transport.
- **Server:** a process exposing tools/resources/prompts. Holds capability + data; never communicates with the model directly.
- **Tool:** a model-controlled capability the model can choose to invoke (an action, often with side effects).
- **Resource:** app/user-controlled context made available to the model (e.g., file contents); not autonomously fetched by the model.
- **Prompt:** a user-controlled, deliberately triggered workflow (e.g., a slash command).
- **Transport:** the channel carrying protocol messages — `stdio` (local subprocess) or streamable HTTP (remote).
- **JSON-RPC 2.0:** the lightweight remote-procedure-call message format MCP uses on the wire.
- **Capability negotiation:** the `initialize` handshake where client and server declare versions and optional features so they can interoperate and degrade gracefully.
- **Self-describing tools:** tools that ship names, descriptions, and JSON schemas so a model can discover and use them at runtime.
- **`tools/list` / `tools/call`:** the operate-phase requests to enumerate available tools and to invoke one.
- **LSP (Language Server Protocol):** prior-art standard that solved the editor-×-language integration explosion; a useful analogy for MCP.
- **O(n²) vs O(n):** quadratic vs linear growth — the cost difference between bespoke per-pair integrations and a shared standard.
