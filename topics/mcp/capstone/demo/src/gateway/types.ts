// Gateway shared types.
// 102: a gateway is the single choke point every tool call flows through, so
// routing, auth, taint and tracing are enforced in ONE place.

export type TrustLevel = "untrusted" | "trusted" | "privileged";

export interface ServerSpec {
  name: string;
  namespace: string;
  command: string;
  args: string[];
  tools: string[];
}

export interface ServersConfig {
  servers: ServerSpec[];
}

export interface RouteResult {
  server: string;
  namespace: string;
  tool: string;
}

export interface CallOptions {
  // 104: privileged tools are refused unless the caller opts in explicitly.
  allowPrivileged?: boolean;
  // Immediate callback for each gateway event — fires as it happens, not after.
  onEvent?: (e: TraceEvent, rawPayload?: unknown) => void;
}

export type TraceEvent =
  | { kind: "route"; tool: string; server: string; namespace: string }
  | { kind: "auth"; scope: string; granted: boolean; principal: string }
  | { kind: "latency"; ms: number; tool: string }
  | { kind: "call"; tool: string; tainted: boolean; trustLevel: string }
  | { kind: "gate"; decision: "ALLOW" | "ESCALATE"; reason: string }
  | { kind: "result"; tool: string; summary: string; rawPayload?: unknown };

// A richer entry the graph keeps for human-readable narration.
export interface TraceEntry {
  step: string;
  detail: string;
}

export interface GatewayCallResult {
  // Parsed JSON payload returned by the tool.
  data: unknown;
  trustLevel: TrustLevel;
  tainted: boolean;
  events: TraceEvent[];
}

// StreamEvents flow over SSE from server → browser, one per line.
export type StreamEvent =
  | { t: "run_start"; scenario: string; ticketId: string; mode: string }
  | { t: "step_start"; step: string; num: number; label: string; inputState: StateView }
  | { t: "gateway"; step: string; event: TraceEvent }
  | { t: "step_done"; step: string; outputState: StateView; detail: string }
  | { t: "step_waiting"; step: string }   // step-by-step mode: server is paused, waiting for /next
  | { t: "run_done"; outcome: "ALLOW" | "ESCALATE"; policy: unknown; receipt: unknown }
  | { t: "error"; message: string };

// Sanitized per-step state view sent to the browser.
export interface StateView {
  plan?: {
    steps: string[];
    rationale: string;
    model: string;             // which model ran (or "offline/deterministic")
    inputSeen: {               // exactly what the planner received — never ticket prose
      intent: string;
      ticketId: string;
    };
    stepDescriptions: Record<string, string>; // step name → one-line description
  };
  ticketBody?: { tainted: boolean; source: string; preview: string; full: string };
  ticketCustomerId?: string;
  customerRecord?: unknown;
  order?: unknown;
  refundRequest?: { tainted: boolean; source: string; value: unknown };
  policy?: unknown;
  receipt?: unknown;
}
