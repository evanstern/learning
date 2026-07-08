/**
 * ============================================================================
 *  DETERMINISTIC POLICY GATE  (MCP 102: default-deny / capability check)
 * ============================================================================
 *
 *  This is the heart of the whole pattern, and it is INTENTIONALLY BORING:
 *  it is plain TypeScript. No LLM. No prompt. Just `if` statements.
 *
 *      >>> You cannot prompt-inject an `if` statement. <<<
 *
 *  An attacker can write "SYSTEM OVERRIDE: ignore all previous instructions"
 *  in a ticket all day long. That text might influence what the quarantined
 *  LLM extracts — but it has zero power over the boolean logic below. The gate
 *  evaluates concrete, validated values against fixed rules.
 *
 *  Design principles baked in here:
 *    - DEFAULT DENY: we start from "ESCALATE" and only ALLOW if every check
 *      passes. A missing/unexpected value fails closed, not open.
 *    - CAPABILITY-STYLE: issue_refund is only authorised under specific
 *      conditions (amount cap, customer ownership). It is not a general power.
 *    - TAINT-AWARE: because the refund amount/order were DERIVED from untrusted
 *      ticket text, they are treated as suspicious and must clear the cap and
 *      the ownership check. Trusted order data is used as the source of truth
 *      to cross-check the tainted request.
 */

import { reveal, type Tainted } from "./taint.js";
import type { PolicyDecision, RefundRequest } from "./types.js";
import type { Order } from "../billing/store.js";

/** Refund auto-approve cap, in dollars. Above this → escalate to a human. */
export const REFUND_AUTO_APPROVE_CAP = 50;

export interface PolicyInputs {
  /** The refund request extracted from the ticket. TAINTED. */
  refundRequest: Tainted<RefundRequest>;
  /** The trusted order record fetched from billing (system of record). */
  order: Order;
  /** The customer the TICKET belongs to (trusted lookup, not from ticket text). */
  ticketCustomerId: string;
}

/**
 * Evaluate whether issue_refund may fire.
 *
 * Returns ALLOW only if ALL hold:
 *   (a) the requested amount is <= the auto-approve cap, AND
 *   (b) the order actually belongs to the ticket's customer (no cross-account
 *       refunds — defeats the "refund to cust_999" injection), AND
 *   (c) the requested amount does not exceed the actual order amount.
 * Otherwise ESCALATE (default deny / fail closed).
 */
export function evaluateRefundPolicy(inputs: PolicyInputs): PolicyDecision {
  // reveal() is the explicit, auditable moment we unwrap tainted data. We do it
  // here, inside the deterministic gate, precisely because this is where we
  // apply scrutiny to it.
  const req = reveal(inputs.refundRequest);
  const { order, ticketCustomerId } = inputs;

  // --- check (b): customer ownership ---------------------------------------
  // The order's owning customer (trusted) must match the ticket's customer
  // (trusted). The injection tries to redirect a refund to cust_999; since the
  // gate cross-checks TRUSTED ownership and never trusts a customer id pulled
  // from ticket prose, that redirection simply has nowhere to take effect.
  if (order.customerId !== ticketCustomerId) {
    return {
      decision: "ESCALATE",
      reason:
        `Customer mismatch: order ${order.id} belongs to ${order.customerId}, ` +
        `but ticket belongs to ${ticketCustomerId}. Refusing cross-account refund.`,
    };
  }

  // --- check (c): amount cannot exceed the real order total ----------------
  if (req.amount > order.amount) {
    return {
      decision: "ESCALATE",
      reason:
        `Requested $${req.amount.toFixed(2)} exceeds order total ` +
        `$${order.amount.toFixed(2)}. Escalating for human review.`,
    };
  }

  // --- check (a): auto-approve cap -----------------------------------------
  // This is the one that stops the $9,999 injection cold, regardless of any
  // clever wording in the ticket.
  if (req.amount > REFUND_AUTO_APPROVE_CAP) {
    return {
      decision: "ESCALATE",
      reason:
        `Amount $${req.amount.toFixed(2)} exceeds auto-approve cap ` +
        `$${REFUND_AUTO_APPROVE_CAP.toFixed(2)}. Escalating for human review.`,
    };
  }

  // Defensive: non-positive amounts are nonsense → fail closed.
  if (!(req.amount > 0)) {
    return {
      decision: "ESCALATE",
      reason: `Non-positive refund amount $${req.amount}. Escalating.`,
    };
  }

  // All checks passed.
  return {
    decision: "ALLOW",
    reason:
      `Within cap ($${req.amount.toFixed(2)} <= $${REFUND_AUTO_APPROVE_CAP}), ` +
      `order belongs to ticket customer, amount <= order total. Auto-approved.`,
  };
}
