// Orchestrator types.
import { z } from "zod";

// The ONLY thing the planner LLM is allowed to see — never the ticket prose.
// 101: trusted control plane (intent + ids) is kept separate from untrusted data.
export interface TrustedUserRequest {
  intent: string;
  ticketId: string;
  principal: string;
}

export interface Plan {
  steps: string[];
  rationale: string;
}

export const RefundRequestSchema = z.object({
  orderId: z.string(),
  targetOrderId: z.string(),
  amount: z.number(),
  reason: z.string(),
  customerId: z.string().optional(),
});
export type RefundRequest = z.infer<typeof RefundRequestSchema>;

export interface PolicyDecision {
  decision: "ALLOW" | "ESCALATE";
  reason: string;
}
