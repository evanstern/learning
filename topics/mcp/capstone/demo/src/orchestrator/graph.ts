// LangGraph orchestration graph — streaming + step-by-step edition.
// onStream is async: after each step_done the server can pause execution until
// the user clicks Next (step-by-step mode) or a brief auto-delay elapses.
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { Gateway } from "../gateway/gateway.js";
import type { TraceEvent, TraceEntry, StreamEvent, StateView } from "../gateway/types.js";
import { makePlan } from "./planner.js";
import { extractRefundRequestLLM } from "./quarantine.js";
import { evaluateRefundPolicy } from "./policy.js";
import { untaint } from "./taint.js";
import type { Tainted } from "./taint.js";
import type { Customer, Order } from "../store/billing.js";
import type { Plan, PolicyDecision, RefundRequest, TrustedUserRequest } from "./types.js";

const StateAnnotation = Annotation.Root({
  request: Annotation<TrustedUserRequest>(),
  plan: Annotation<Plan | undefined>(),
  ticketBody: Annotation<Tainted<string> | undefined>(),
  ticketCustomerId: Annotation<string | undefined>(),
  customerRecord: Annotation<Customer | undefined>(),
  order: Annotation<Order | undefined>(),
  refundRequest: Annotation<Tainted<RefundRequest> | undefined>(),
  policy: Annotation<PolicyDecision | undefined>(),
  receipt: Annotation<unknown>(),
  events: Annotation<TraceEvent[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  trace: Annotation<TraceEntry[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

type State = typeof StateAnnotation.State;

export interface RunResult {
  outcome: "ALLOW" | "ESCALATE";
  events: TraceEvent[];
  trace: TraceEntry[];
  receipt: unknown;
  policy?: PolicyDecision;
}

// onStream is async so the server can pause after step_done in step-by-step mode.
type OnStream = (e: StreamEvent) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let stepCounter = 0;

const STEP_DESCRIPTIONS: Record<string, string> = {
  fetch_ticket:   "Call support.get_ticket (UNTRUSTED). Gateway taints the response — body is attacker-controlled.",
  extract:        "Quarantine LLM reads tainted body, emits structured RefundRequest only. No tools. Output stays tainted.",
  fetch_customer: "Call support.get_customer (TRUSTED). Used to verify ticket ownership — never from ticket text.",
  fetch_order:    "Call billing.get_order (TRUSTED). System-of-record amount used by the gate, never from the ticket.",
  gate:           "Deterministic if-statements decide ALLOW or ESCALATE. No LLM. Cannot be prompt-injected.",
  execute_or_escalate: "Gate routes to billing.issue_refund (ALLOW) or the escalate terminal (ESCALATE).",
};

function stateView(s: State): StateView {
  return {
    plan: s.plan
      ? {
          steps: s.plan.steps,
          rationale: s.plan.rationale,
          model: process.env.ANTHROPIC_API_KEY ? "claude-haiku-4-5 (live)" : "offline / deterministic",
          inputSeen: { intent: s.request.intent, ticketId: s.request.ticketId },
          stepDescriptions: STEP_DESCRIPTIONS,
        }
      : undefined,
    ticketBody: s.ticketBody
      ? {
          tainted: true,
          source: s.ticketBody.source,
          preview: untaint(s.ticketBody).slice(0, 80),
          full: untaint(s.ticketBody),
        }
      : undefined,
    ticketCustomerId: s.ticketCustomerId,
    customerRecord: s.customerRecord,
    order: s.order,
    refundRequest: s.refundRequest
      ? { tainted: true, source: s.refundRequest.source, value: untaint(s.refundRequest) }
      : undefined,
    policy: s.policy,
    receipt: s.receipt,
  };
}

// Gateway call options that wire each gateway TraceEvent back into onStream.
function gwOpts(
  step: string,
  onStream: OnStream | undefined,
  extra?: { allowPrivileged?: boolean },
) {
  return {
    ...extra,
    onEvent: (e: TraceEvent) => onStream?.({ t: "gateway", step, event: e }),
  };
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

export function buildGraph(gateway: Gateway, onStream?: OnStream) {
  stepCounter = 0;

  async function emit(step: string, label: string, inputState: State) {
    await onStream?.({ t: "step_start", step, num: ++stepCounter, label, inputState: stateView(inputState) });
  }

  // done() is awaited by each node — this is what lets the server pause
  // execution between steps in step-by-step mode.
  async function done(step: string, output: Partial<State>, mergedState: State, detail: string) {
    const merged = { ...mergedState, ...output };
    await onStream?.({ t: "step_done", step, outputState: stateView(merged as State), detail });
  }

  const graph = new StateGraph(StateAnnotation)

    // ── planner ─────────────────────────────────────────────────────────────
    .addNode("planner", async (s: State) => {
      await emit("planner", "Planner — privileged LLM (trusted input only)", s);
      const plan = await makePlan(s.request);
      const out = { plan, trace: [{ step: "planner", detail: plan.rationale }] };
      await done("planner", out, s, plan.rationale);
      return out;
    })

    // ── fetch_ticket ─────────────────────────────────────────────────────────
    .addNode("fetch_ticket", async (s: State) => {
      await emit("fetch_ticket", "Fetch ticket — UNTRUSTED source → tainted at gateway boundary", s);
      const r = await gateway.call(
        "support.get_ticket",
        { ticketId: s.request.ticketId },
        s.request.principal,
        gwOpts("fetch_ticket", onStream),
      );
      const ticket = untaint(r.data as Tainted<{ body: string; customerId: string }>);
      const out = {
        ticketBody: { value: ticket.body, tainted: true as const, source: "support.get_ticket" },
        ticketCustomerId: ticket.customerId,
        events: r.events,
        trace: [{ step: "fetch_ticket", detail: "ticket fetched (TAINTED untrusted body)" }],
      };
      await done("fetch_ticket", out, s, "Ticket loaded — body tainted at gateway boundary");
      return out;
    })

    // ── extract ──────────────────────────────────────────────────────────────
    .addNode("extract", async (s: State) => {
      await emit("extract", "Quarantine LLM — no tools, structured output only, result stays tainted", s);
      const body = s.ticketBody ? untaint(s.ticketBody) : "";
      const refundRequest = await extractRefundRequestLLM(body, "quarantine-llm", s.order?.amount);
      const rr = untaint(refundRequest);
      const detail = `Extracted orderId=${rr.orderId} amount=$${rr.amount} — result remains tainted`;
      const out = {
        refundRequest,
        trace: [{ step: "extract", detail: `quarantine extracted orderId=${rr.orderId} amount=$${rr.amount} (TAINTED)` }],
      };
      await done("extract", out, s, detail);
      return out;
    })

    // ── fetch_customer ───────────────────────────────────────────────────────
    .addNode("fetch_customer", async (s: State) => {
      await emit("fetch_customer", "Fetch customer — TRUSTED source, used to verify ticket ownership", s);
      const cid = s.ticketCustomerId ?? "";
      const r = await gateway.call(
        "support.get_customer",
        { customerId: cid },
        s.request.principal,
        gwOpts("fetch_customer", onStream),
      );
      const customer = r.data as Customer;
      const out = {
        customerRecord: customer,
        events: r.events,
        trace: [{ step: "fetch_customer", detail: "customer verified (trusted)" }],
      };
      await done("fetch_customer", out, s, `Customer verified: ${customer.name} (${customer.id})`);
      return out;
    })

    // ── fetch_order ──────────────────────────────────────────────────────────
    .addNode("fetch_order", async (s: State) => {
      await emit("fetch_order", "Fetch order — TRUSTED system-of-record amount used by gate", s);
      const tainted = s.refundRequest;
      const claimedOrderId = tainted ? untaint(tainted).orderId : "";
      const prev = tainted ? untaint(tainted) : undefined;

      let order: Order | undefined;
      let events = [] as typeof s.events;
      let detail: string;
      try {
        const r = await gateway.call(
          "billing.get_order",
          { orderId: claimedOrderId },
          s.request.principal,
          gwOpts("fetch_order", onStream),
        );
        order = r.data as Order;
        events = r.events;
        detail = `Order verified: ${order.id} $${order.amount} (trusted system of record)`;
      } catch {
        detail = `Claimed order "${claimedOrderId || "<none>"}" not found — gate will see mismatch`;
      }

      let refreshed = tainted;
      if (prev) {
        const amount = prev.amount > 0 ? prev.amount : (order?.amount ?? 0);
        refreshed = {
          value: { ...prev, amount, targetOrderId: order?.id ?? prev.targetOrderId },
          tainted: true as const,
          source: "quarantine-llm",
        };
      }
      const out = { order, refundRequest: refreshed, events, trace: [{ step: "fetch_order", detail }] };
      await done("fetch_order", out, s, detail);
      return out;
    })

    // ── gate ─────────────────────────────────────────────────────────────────
    // DETERMINISTIC. No LLM. Plain if-statements. Cannot be prompt-injected.
    .addNode("gate", async (s: State) => {
      await emit("gate", "Policy gate — DETERMINISTIC if-statements, no LLM, cannot be prompt-injected", s);
      const req = s.refundRequest ? untaint(s.refundRequest) : undefined;
      const decision: PolicyDecision = req
        ? evaluateRefundPolicy(req)
        : { decision: "ESCALATE", reason: "no refund request extracted" };
      const ev: TraceEvent = { kind: "gate", decision: decision.decision, reason: decision.reason };
      await onStream?.({ t: "gateway", step: "gate", event: ev });
      const detail = `${decision.decision}: ${decision.reason}`;
      const out = { policy: decision, events: [ev], trace: [{ step: "gate", detail }] };
      await done("gate", out, s, detail);
      return out;
    })

    // ── execute_refund ───────────────────────────────────────────────────────
    .addNode("execute_refund", async (s: State) => {
      await emit("execute_refund", "Execute refund — PRIVILEGED write, only reachable after ALLOW", s);
      const req = untaint(s.refundRequest!);
      const r = await gateway.call(
        "billing.issue_refund",
        { orderId: req.targetOrderId, amount: req.amount, reason: req.reason },
        s.request.principal,
        gwOpts("execute_refund", onStream, { allowPrivileged: true }),
      );
      const out = {
        receipt: r.data,
        events: r.events,
        trace: [{ step: "execute_refund", detail: `refund issued (SIMULATED) $${req.amount}` }],
      };
      await done("execute_refund", out, s, `Simulated refund issued: $${req.amount}`);
      return out;
    })

    // ── escalate ─────────────────────────────────────────────────────────────
    .addNode("escalate", async (s: State) => {
      await emit("escalate", "Escalate — default-deny terminal, no refund issued", s);
      const reason = s.policy?.reason ?? "policy escalation";
      const out = {
        receipt: { escalated: true },
        trace: [{ step: "escalate", detail: "escalated to human — NO refund issued" }],
      };
      await done("escalate", out, s, `No refund. ${reason}`);
      return out;
    });

  graph
    .addEdge(START, "planner")
    .addEdge("planner", "fetch_ticket")
    .addEdge("fetch_ticket", "extract")
    .addEdge("extract", "fetch_customer")
    .addEdge("fetch_customer", "fetch_order")
    .addEdge("fetch_order", "gate")
    .addConditionalEdges("gate", (s: State) =>
      s.policy?.decision === "ALLOW" ? "execute_refund" : "escalate",
    )
    .addEdge("execute_refund", END)
    .addEdge("escalate", END);

  return graph.compile();
}

export async function runScenario(
  gateway: Gateway,
  request: TrustedUserRequest,
  onStream?: OnStream,
): Promise<RunResult> {
  const app = buildGraph(gateway, onStream);
  const final = (await app.invoke({ request })) as State;
  return {
    outcome: final.policy?.decision ?? "ESCALATE",
    events: final.events,
    trace: final.trace,
    receipt: final.receipt,
    policy: final.policy,
  };
}
