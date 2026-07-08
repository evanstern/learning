// Simulated auth/scope check.
// 104: every privileged action requires a scope the principal actually holds —
// least privilege enforced at the gateway, not inside the tool.
import type { TraceEvent, TrustLevel } from "./types.js";

// Map each tool to the scope it requires.
const SCOPE_FOR_TOOL: Record<string, string> = {
  "support.get_ticket": "support:read",
  "support.get_customer": "support:read",
  "billing.get_order": "billing:read",
  "billing.issue_refund": "billing:write",
};

// The demo principal: an orchestrator allowed to read everything and write refunds.
const PRINCIPAL_SCOPES: Record<string, string[]> = {
  orchestrator: ["support:read", "billing:read", "billing:write"],
};

export function requiredScope(namespacedTool: string, trustLevel: TrustLevel): string {
  return SCOPE_FOR_TOOL[namespacedTool] ?? (trustLevel === "privileged" ? "admin" : "read");
}

export function checkAuth(
  principal: string,
  namespacedTool: string,
  trustLevel: TrustLevel,
  emit: (e: TraceEvent) => void,
): { granted: boolean; scope: string } {
  const scope = requiredScope(namespacedTool, trustLevel);
  const held = PRINCIPAL_SCOPES[principal] ?? [];
  const granted = held.includes(scope);
  emit({ kind: "auth", scope, granted, principal });
  return { granted, scope };
}
