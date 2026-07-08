/**
 * ============================================================================
 *  SHARED TYPES & SCHEMAS
 * ============================================================================
 * Centralises the structured-output contract used to cross trust boundaries.
 *
 * Key idea (MCP 102): we never let untrusted text flow through the system as
 * free-form prose. Instead the QUARANTINED LLM must squeeze it down to this
 * narrow, validated shape. A typed schema is a much smaller attack surface than
 * arbitrary text — there is nowhere in `RefundRequest` to hide "ignore all
 * previous instructions".
 */

import { z } from "zod";
import type { Tainted } from "./taint.js";

/**
 * The ONLY thing the quarantined LLM is allowed to emit. Note what is NOT here:
 * no "instructions", no "customer to refund", no free text the planner could be
 * tricked into obeying. Just the three facts we need to make a decision.
 */
export const RefundRequestSchema = z.object({
  orderId: z
    .string()
    .describe("The order id the customer is asking to be refunded, e.g. ord_123"),
  amount: z
    .number()
    .describe("The refund amount in dollars the customer is requesting."),
  reason: z
    .string()
    .describe("A short, neutral summary of why a refund is requested."),
});

export type RefundRequest = z.infer<typeof RefundRequestSchema>;

/**
 * What the PLANNER (privileged LLM) is allowed to see and decide. Crucially it
 * only contains the TRUSTED user request — never the raw ticket body. See
 * planner.ts.
 */
export interface TrustedUserRequest {
  /** The authenticated/trusted intent, e.g. "Process this refund ticket." */
  intent: string;
  /** The ticket id the human agent selected (trusted: chosen in our UI/CLI). */
  ticketId: string;
}

/** A single high-level step the planner produced. Structured, not prose. */
export interface PlanStep {
  action: "get_ticket" | "get_order" | "issue_refund";
  note: string;
}

export interface Plan {
  steps: PlanStep[];
}

/** Decision emitted by the deterministic policy gate (policy.ts). */
export type PolicyDecision =
  | { decision: "ALLOW"; reason: string }
  | { decision: "ESCALATE"; reason: string };

/**
 * The LangGraph state object. Everything the nodes read/write lives here.
 * Note how untrusted data is always stored as Tainted<...> so its provenance
 * survives every hop through the graph.
 */
export interface GraphState {
  // --- trusted inputs ---
  request: TrustedUserRequest;
  plan?: Plan;

  // --- fetched data ---
  /** Ticket body is UNTRUSTED → tainted. */
  ticketBody?: Tainted<string>;
  /** The ticket's owning customer id (trusted lookup metadata). */
  ticketCustomerId?: string;
  /** Order record (trusted source). */
  order?: { id: string; customerId: string; amount: number; item: string };

  /** Extracted refund request — DERIVED FROM untrusted text → still tainted. */
  refundRequest?: Tainted<RefundRequest>;

  // --- gate + outcome ---
  policy?: PolicyDecision;
  receipt?: unknown;

  /** Append-only human-readable trace for the UI/CLI. */
  trace: TraceEntry[];
}

export interface TraceEntry {
  step: string;
  detail: string;
  taint?: string;
}
