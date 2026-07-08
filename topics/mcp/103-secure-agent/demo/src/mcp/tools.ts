/**
 * ============================================================================
 *  MCP TOOL DEFINITIONS
 * ============================================================================
 *
 *  These are the tools the MCP server exposes. Each tool carries an explicit
 *  TRUST classification in its metadata + comments. This classification is the
 *  whole reason taint tracking exists:
 *
 *    - get_ticket   → UNTRUSTED source. The ticket body is attacker-controllable
 *                     free text. Anything that comes out of here is TAINTED.
 *    - get_order    → TRUSTED source. Comes from our own billing records.
 *    - issue_refund → PRIVILEGED / side-effecting capability. Must only ever be
 *                     invoked after the deterministic policy gate approves.
 *
 *  Zod schemas validate every input — a tool should never trust that the
 *  caller gave well-formed arguments.
 */

import { z } from "zod";
import {
  getTicket,
  getOrder,
  issueRefund,
  type Ticket,
  type Order,
  type RefundReceipt,
} from "../billing/store.js";

/** Trust level advertised to the orchestrator / documented for humans. */
export type TrustLevel = "UNTRUSTED" | "TRUSTED" | "PRIVILEGED";

// ---- input schemas (zod) --------------------------------------------------

export const GetTicketInput = z.object({
  ticketId: z.string().describe("Ticket id, e.g. tkt_123"),
});

export const GetOrderInput = z.object({
  orderId: z.string().describe("Order id, e.g. ord_123"),
});

export const IssueRefundInput = z.object({
  orderId: z.string().describe("Order id to refund."),
  amount: z.number().describe("Refund amount in dollars."),
  reason: z.string().describe("Reason for the refund."),
});

// ---- tool metadata (for docs + for the orchestrator to know trust levels) --

export const TOOL_TRUST: Record<string, TrustLevel> = {
  // The ticket BODY is untrusted: it's whatever a customer (or attacker) typed.
  get_ticket: "UNTRUSTED",
  // Order data is our own system-of-record.
  get_order: "TRUSTED",
  // Moving money is privileged and gated.
  issue_refund: "PRIVILEGED",
};

// ---- the actual implementations (thin wrappers over the store) ------------

export function runGetTicket(args: z.infer<typeof GetTicketInput>): Ticket {
  const t = getTicket(args.ticketId);
  if (!t) throw new Error(`ticket not found: ${args.ticketId}`);
  return t;
}

export function runGetOrder(args: z.infer<typeof GetOrderInput>): Order {
  const o = getOrder(args.orderId);
  if (!o) throw new Error(`order not found: ${args.orderId}`);
  return o;
}

export function runIssueRefund(
  args: z.infer<typeof IssueRefundInput>,
): RefundReceipt {
  // NOTE: this implementation does NOT enforce policy. In the orchestrated
  // demo, policy.ts gates this call. The MCP tool itself is just the
  // capability; the deterministic gate is the thing that decides to use it.
  return issueRefund(args);
}
