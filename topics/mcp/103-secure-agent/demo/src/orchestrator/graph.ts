/**
 * ============================================================================
 *  ORCHESTRATION GRAPH  (LangGraph StateGraph)
 * ============================================================================
 *
 *  Wires the whole secure pattern together as an explicit state machine:
 *
 *     plan ──▶ fetch_ticket ──▶ extract(quarantined) ──▶ fetch_order ──▶ gate
 *                                                                          │
 *                                              ┌───────────────────────────┤
 *                                       ALLOW  │                           │ ESCALATE
 *                                              ▼                           ▼
 *                                       execute_refund                 escalate
 *
 *  The crucial bit is the conditional edge after `gate`: the branch is chosen
 *  by `policyRouter`, which reads the DETERMINISTIC PolicyDecision from typed
 *  state — NOT from any model free-text. The model never gets to decide whether
 *  the refund happens; plain code does.
 *
 *  Trust boundaries, mapped to nodes:
 *    - plan            → PRIVILEGED LLM, sees only trusted request (planner.ts)
 *    - fetch_ticket    → loads UNTRUSTED body, wraps it Tainted (taint.ts)
 *    - extract         → QUARANTINED LLM, tool-less, output stays Tainted
 *    - fetch_order     → TRUSTED data fetch
 *    - gate            → deterministic policy (policy.ts) — "if statements"
 *    - execute_refund  → PRIVILEGED simulated write (store.issueRefund)
 *    - escalate        → safe default-deny terminal
 */

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

import {
  getTicket,
  getOrder,
  issueRefund,
  type Order,
} from "../billing/store.js";
import { taint, reveal, taintTag, type Tainted } from "./taint.js";
import {
  extractRefundRequest,
  extractRefundRequestOffline,
} from "./quarantine.js";
import { planRefundWorkflow } from "./planner.js";
import { evaluateRefundPolicy } from "./policy.js";
import type {
  Plan,
  PolicyDecision,
  RefundRequest,
  TraceEntry,
  TrustedUserRequest,
} from "./types.js";

/**
 * LangGraph state channels. Each channel declares how updates merge. The trace
 * is append-only (reducer concatenates); everything else is last-write-wins.
 */
const StateAnnotation = Annotation.Root({
  request: Annotation<TrustedUserRequest>(),
  plan: Annotation<Plan | undefined>(),
  ticketBody: Annotation<Tainted<string> | undefined>(),
  ticketCustomerId: Annotation<string | undefined>(),
  order: Annotation<Order | undefined>(),
  refundRequest: Annotation<Tainted<RefundRequest> | undefined>(),
  policy: Annotation<PolicyDecision | undefined>(),
  receipt: Annotation<unknown>(),
  trace: Annotation<TraceEntry[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});

type S = typeof StateAnnotation.State;

// ---------------------------------------------------------------------------
//  NODES
// ---------------------------------------------------------------------------

/** PRIVILEGED LLM: plan from trusted request only (no ticket text in scope). */
async function planNode(state: S): Promise<Partial<S>> {
  const plan = await planRefundWorkflow(state.request);
  return {
    plan,
    trace: [
      {
        step: "plan (privileged LLM)",
        detail:
          `Planned ${plan.steps.map((s) => s.action).join(" → ")}. ` +
          `Planner saw only the trusted request (ticket id + intent), never the body.`,
        taint: "[trusted]",
      },
    ],
  };
}

/** Load the UNTRUSTED ticket body and wrap it tainted. */
function fetchTicketNode(state: S): Partial<S> {
  const ticket = getTicket(state.request.ticketId);
  if (!ticket) {
    return {
      trace: [
        {
          step: "fetch_ticket",
          detail: `Ticket ${state.request.ticketId} not found.`,
        },
      ],
    };
  }
  const tainted = taint(ticket.body, `ticket:${ticket.id}`);
  return {
    ticketBody: tainted,
    ticketCustomerId: ticket.customerId, // trusted metadata, not from body text
    trace: [
      {
        step: "fetch_ticket (UNTRUSTED source)",
        detail: `Loaded body of ${ticket.id}. Body is attacker-controllable; tainting it.`,
        taint: taintTag(tainted),
      },
    ],
  };
}

/** QUARANTINED LLM: extract a structured RefundRequest; output stays tainted. */
async function extractNode(state: S): Promise<Partial<S>> {
  if (!state.ticketBody) {
    return {
      trace: [{ step: "extract", detail: "No ticket body to extract from." }],
    };
  }
  const body = reveal(state.ticketBody);
  const source = state.ticketBody.source;

  // Use the real quarantined LLM if a key is present, else offline fallback.
  const extracted = process.env.ANTHROPIC_API_KEY
    ? await extractRefundRequest(body, source)
    : extractRefundRequestOffline(body, source);

  const r = reveal(extracted);
  return {
    refundRequest: extracted,
    trace: [
      {
        step: "extract (QUARANTINED LLM — no tools)",
        detail:
          `Extracted { orderId: ${r.orderId}, amount: $${r.amount}, reason: "${r.reason.slice(0, 60)}" }. ` +
          `Tool-less + structured output; result remains tainted.`,
        taint: taintTag(extracted),
      },
    ],
  };
}

/** TRUSTED fetch: the order the request points at. */
function fetchOrderNode(state: S): Partial<S> {
  const orderId = state.refundRequest
    ? reveal(state.refundRequest).orderId
    : undefined;
  const order = orderId ? getOrder(orderId) : undefined;
  return {
    order,
    trace: [
      {
        step: "fetch_order (TRUSTED source)",
        detail: order
          ? `Loaded order ${order.id}: customer ${order.customerId}, $${order.amount}, "${order.item}".`
          : `Order ${orderId ?? "?"} not found.`,
        taint: "[trusted]",
      },
    ],
  };
}

/** DETERMINISTIC GATE: plain code decides ALLOW vs ESCALATE. */
function gateNode(state: S): Partial<S> {
  if (!state.refundRequest || !state.order || !state.ticketCustomerId) {
    return {
      policy: { decision: "ESCALATE", reason: "Missing data; failing closed." },
      trace: [
        {
          step: "policy gate (DETERMINISTIC — no LLM)",
          detail: "Required inputs missing → default-deny ESCALATE.",
          taint: "[trusted code]",
        },
      ],
    };
  }
  const decision = evaluateRefundPolicy({
    refundRequest: state.refundRequest,
    order: state.order,
    ticketCustomerId: state.ticketCustomerId,
  });
  return {
    policy: decision,
    trace: [
      {
        step: "policy gate (DETERMINISTIC — no LLM)",
        detail: `${decision.decision}: ${decision.reason}`,
        taint: "[trusted code — you can't prompt-inject an if statement]",
      },
    ],
  };
}

/** PRIVILEGED side effect: simulated refund write. Only reached on ALLOW. */
function executeNode(state: S): Partial<S> {
  const req = reveal(state.refundRequest!);
  const receipt = issueRefund({
    orderId: req.orderId,
    amount: req.amount,
    reason: req.reason,
  });
  return {
    receipt,
    trace: [
      {
        step: "execute_refund (PRIVILEGED — SIMULATED write)",
        detail: `Refund issued (simulated). Receipt ${(receipt as { receiptId: string }).receiptId}.`,
        taint: "[trusted code]",
      },
    ],
  };
}

/** Safe terminal: refund withheld, routed to a human. */
function escalateNode(state: S): Partial<S> {
  return {
    trace: [
      {
        step: "escalate (DEFAULT-DENY terminal)",
        detail: `No refund issued. ${state.policy?.reason ?? ""}`.trim(),
        taint: "[trusted code]",
      },
    ],
  };
}

/** Conditional router — reads the DETERMINISTIC decision from typed state. */
function policyRouter(state: S): "execute_refund" | "escalate" {
  return state.policy?.decision === "ALLOW" ? "execute_refund" : "escalate";
}

// ---------------------------------------------------------------------------
//  GRAPH ASSEMBLY
// ---------------------------------------------------------------------------

export function buildGraph() {
  const graph = new StateGraph(StateAnnotation)
    .addNode("planner", planNode)
    .addNode("fetch_ticket", fetchTicketNode)
    .addNode("extract", extractNode)
    .addNode("fetch_order", fetchOrderNode)
    .addNode("gate", gateNode)
    .addNode("execute_refund", executeNode)
    .addNode("escalate", escalateNode)
    .addEdge(START, "planner")
    .addEdge("planner", "fetch_ticket")
    .addEdge("fetch_ticket", "extract")
    .addEdge("extract", "fetch_order")
    .addEdge("fetch_order", "gate")
    // The security-critical branch: chosen by code, not by a model.
    .addConditionalEdges("gate", policyRouter, {
      execute_refund: "execute_refund",
      escalate: "escalate",
    })
    .addEdge("execute_refund", END)
    .addEdge("escalate", END);

  return graph.compile();
}

export interface RunResult {
  trace: TraceEntry[];
  decision: PolicyDecision | undefined;
  receipt: unknown;
}

/** Run one scenario end-to-end and return its trace + outcome. */
export async function runScenario(
  request: TrustedUserRequest,
): Promise<RunResult> {
  const app = buildGraph();
  const final = (await app.invoke({ request })) as S;
  return {
    trace: final.trace,
    decision: final.policy,
    receipt: final.receipt,
  };
}
