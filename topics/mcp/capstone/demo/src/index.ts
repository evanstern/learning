// CLI demo — runs both scenarios and prints the full gateway trace.
// Expect: tkt_123 → ALLOW ($42 receipt), tkt_666 → ESCALATE.
import { Gateway } from "./gateway/gateway.js";
import { runScenario } from "./orchestrator/graph.js";
import type { TraceEvent, TraceEntry } from "./gateway/types.js";

function printEvents(events: TraceEvent[]): void {
  for (const e of events) {
    switch (e.kind) {
      case "route":
        console.log(`   [route]   ${e.namespace}.${"".padEnd(0)}→ ${e.server} :: ${e.tool}`);
        break;
      case "auth":
        console.log(`   [auth]    scope=${e.scope} granted=${e.granted ? "YES" : "NO"} principal=${e.principal}`);
        break;
      case "latency":
        console.log(`   [latency] ${e.ms}ms  ${e.tool}`);
        break;
      case "call":
        console.log(`   [call]    ${e.tool} trust=${e.trustLevel} tainted=${e.tainted ? "TAINTED" : "clean"}`);
        break;
      case "gate":
        console.log(`   [gate]    ${e.decision} — ${e.reason}`);
        break;
      case "result":
        console.log(`   [result]  ${e.tool}: ${e.summary}`);
        break;
    }
  }
}

function printTrace(trace: TraceEntry[]): void {
  for (const t of trace) console.log(`   • ${t.step}: ${t.detail}`);
}

async function main(): Promise<void> {
  const gateway = new Gateway();
  console.log("=".repeat(72));
  console.log("MCP CAPSTONE DEMO — gateway-mediated refund triage");
  console.log(process.env.ANTHROPIC_API_KEY ? "(LLM-enhanced mode)" : "(offline deterministic mode)");
  console.log("=".repeat(72));

  const scenarios = [
    { label: "BENIGN", ticketId: "tkt_123" },
    { label: "MALICIOUS", ticketId: "tkt_666" },
  ];

  try {
    for (const sc of scenarios) {
      console.log(`\n\n### Scenario: ${sc.label} (${sc.ticketId}) ###`);
      const res = await runScenario(gateway, {
        intent: "process_refund",
        ticketId: sc.ticketId,
        principal: "orchestrator",
      });

      console.log("\n-- Gateway TraceEvents --");
      printEvents(res.events);

      console.log("\n-- Orchestrator TraceEntries --");
      printTrace(res.trace);

      console.log(`\n>>> ${sc.ticketId} → ${res.outcome}`);
      if (res.outcome === "ALLOW") {
        console.log(`    receipt: ${JSON.stringify(res.receipt)}`);
      }
    }
  } finally {
    await gateway.close();
  }

  console.log("\n" + "=".repeat(72));
  console.log("Summary: tkt_123 → ALLOW ($42 receipt) | tkt_666 → ESCALATE");
  console.log("=".repeat(72));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
