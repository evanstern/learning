// Deterministic policy gate — 103: no LLM in the gate, pure if-statements.
// The gate is the trust boundary between (tainted) extracted data and the
// privileged refund action. Because it is deterministic it cannot be
// prompt-injected.
import type { PolicyDecision, RefundRequest } from "./types.js";

export function evaluateRefundPolicy(req: RefundRequest): PolicyDecision {
  if (req.amount > 500) {
    return { decision: "ESCALATE", reason: `amount $${req.amount} exceeds $500 limit` };
  }
  if (req.orderId !== req.targetOrderId) {
    return { decision: "ESCALATE", reason: "order mismatch" };
  }
  return { decision: "ALLOW", reason: "within policy limits" };
}
