// Planner — 101: sees ONLY the trusted request (intent + ticketId), NEVER the
// ticket prose. This keeps the planning/control plane free of attacker text.
import type { Plan, TrustedUserRequest } from "./types.js";

const FIXED_PLAN: Plan = {
  steps: ["fetch_ticket", "extract", "fetch_customer", "fetch_order", "gate", "execute_or_escalate"],
  rationale: "Standard refund triage: fetch untrusted ticket, quarantine-extract, verify against system of record, deterministic gate.",
};

export async function makePlan(request: TrustedUserRequest): Promise<Plan> {
  // Offline-first: deterministic fixed plan is the DEFAULT.
  if (!process.env.ANTHROPIC_API_KEY) return FIXED_PLAN;
  try {
    const { ChatAnthropic } = await import("@langchain/anthropic");
    const model = new ChatAnthropic({ model: "claude-haiku-4-5", temperature: 0 });
    const res = await model.invoke([
      {
        role: "system",
        content:
          "You are a refund-triage planner. You ONLY see an intent and a ticket id, " +
          "never ticket contents. Reply with a short one-line rationale.",
      },
      { role: "user", content: `intent=${request.intent} ticketId=${request.ticketId}` },
    ]);
    const rationale = typeof res.content === "string" ? res.content : FIXED_PLAN.rationale;
    return { steps: FIXED_PLAN.steps, rationale: rationale.slice(0, 200) };
  } catch {
    return FIXED_PLAN;
  }
}
