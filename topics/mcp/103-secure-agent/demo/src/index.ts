/**
 * ============================================================================
 *  CLI RUNNER  —  npm run demo
 * ============================================================================
 *
 *  Runs BOTH canonical scenarios through the secure orchestration graph and
 *  prints the step-by-step trace, so the whole pattern is demonstrable without
 *  the web UI.
 *
 *    - tkt_123 (BENIGN):    $42 refund, in-cap, correct customer  → ALLOW
 *    - tkt_666 (MALICIOUS): "$9,999 to cust_999" prompt injection → ESCALATE
 *
 *  Works with OR without ANTHROPIC_API_KEY:
 *    - With a key:  the quarantined + planner LLMs make real calls.
 *    - Without:     deterministic offline fallbacks run, and the DETERMINISTIC
 *                   policy gate (the part that actually stops the attack) still
 *                   runs identically. The gate never needed the LLM anyway.
 */

import { runScenario } from "./orchestrator/graph.js";
import type { TrustedUserRequest } from "./orchestrator/types.js";

const SCENARIOS: { label: string; request: TrustedUserRequest }[] = [
  {
    label: "BENIGN  — tkt_123 (genuine $42 damaged-Widget refund)",
    request: { intent: "Process this refund ticket.", ticketId: "tkt_123" },
  },
  {
    label: "MALICIOUS — tkt_666 (prompt injection: $9,999 to cust_999)",
    request: { intent: "Process this refund ticket.", ticketId: "tkt_666" },
  },
];

function hr(): void {
  console.log("─".repeat(78));
}

async function main(): Promise<void> {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  console.log("MCP 103 — dual-LLM / taint / deterministic policy gate demo");
  console.log(
    hasKey
      ? "Mode: LIVE (ANTHROPIC_API_KEY detected — real LLM calls)."
      : "Mode: OFFLINE (no ANTHROPIC_API_KEY — deterministic fallbacks; gate still enforced).",
  );
  hr();

  for (const sc of SCENARIOS) {
    console.log(`\nSCENARIO: ${sc.label}\n`);
    const result = await runScenario(sc.request);

    for (const [i, entry] of result.trace.entries()) {
      const tag = entry.taint ? `  ${entry.taint}` : "";
      console.log(`  ${i + 1}. ${entry.step}${tag}`);
      console.log(`       ${entry.detail}`);
    }

    console.log("");
    console.log(`  >> DECISION: ${result.decision?.decision ?? "UNKNOWN"}`);
    if (result.receipt) {
      console.log(`  >> RECEIPT:  ${JSON.stringify(result.receipt)}`);
    } else {
      console.log("  >> RECEIPT:  none (no refund issued)");
    }
    hr();
  }

  console.log(
    "\nTakeaway: the malicious ticket can say anything it wants, but the refund " +
      "decision is made by deterministic code (policy.ts). You can't prompt-inject an if statement.",
  );
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
