# MCP Capstone Demo — Gateway-Mediated Refund Triage

A small, fully runnable demo that ties together the MCP security concepts
(101–104) into one pipeline: an orchestrator processes refund requests by
calling two MCP servers **exclusively through a Gateway**, with prompt-injection
defenses baked in.

## The threat

A support ticket is **attacker-controllable free text**. A naive agent that
feeds the ticket straight into a tool-using LLM can be prompt-injected into
issuing a fraudulent refund (`tkt_666`). This demo shows the defenses.

## The controls

- **101 — Dual-LLM / taint tracking.** The *planner* LLM sees only the trusted
  request (`intent` + `ticketId`), never the ticket prose. The ticket body is
  *tainted* at the gateway boundary. A tool-less *quarantine* LLM reads the
  tainted ticket and emits structured data that is itself still tainted.
- **102 — Gateway as single choke point.** Every tool call flows through the
  `Gateway`: namespace routing, middleware (logging + latency), auth scopes,
  taint, and tracing all happen in one place.
- **103 — Deterministic policy gate.** `evaluateRefundPolicy()` is pure
  if-statements, **no LLM** — so it cannot be prompt-injected. It is the trust
  boundary between tainted data and the privileged action.
- **104 — Privileged tool gating + least privilege.** `billing.issue_refund` is
  `TRUST=privileged`; the gateway refuses it unless `allowPrivileged: true`, and
  the auth layer requires the `billing:write` scope.

## Architecture

```
TrustedUserRequest → [planner] → Gateway → support-crm / billing MCP servers
                                    ↓
                   [quarantine LLM] → [policy gate] → ALLOW → issue_refund
                                                    → ESCALATE → no refund
```

## Run it

```bash
# offline deterministic mode (no API key needed):
npm install
npm run demo          # prints both scenarios + full gateway trace
npm run typecheck     # exits 0

# web UI on http://localhost:3104
npm run web
```

Optional: set `ANTHROPIC_API_KEY` to enable LLM-backed planner/quarantine
(the deterministic offline fallbacks remain the default and guarantee
reproducible output). Set `GATEWAY_LATENCY_MS` to inject artificial latency.

## Expected outcome

- `tkt_123` (benign) → **ALLOW** with a simulated `$42` receipt.
- `tkt_666` (malicious `$9,999` override) → **ESCALATE**, no refund.

Reads are real (`data/billing.json`); the refund write is **simulated**.
