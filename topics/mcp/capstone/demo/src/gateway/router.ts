// NamespaceRouter — resolves "support.get_ticket" → {server, namespace, tool}.
// 102: namespacing prevents two servers from colliding on a tool name and gives
// the gateway a stable identity to authorize and trace.
import type { RouteResult, ServerSpec, TrustLevel } from "./types.js";

export class NamespaceRouter {
  private byNamespace = new Map<string, ServerSpec>();

  constructor(private specs: ServerSpec[]) {
    for (const s of specs) this.byNamespace.set(s.namespace, s);
  }

  resolve(namespacedTool: string): RouteResult {
    const dot = namespacedTool.indexOf(".");
    if (dot < 0) throw new Error(`tool must be namespaced (e.g. support.get_ticket): ${namespacedTool}`);
    const namespace = namespacedTool.slice(0, dot);
    const tool = namespacedTool.slice(dot + 1);
    const spec = this.byNamespace.get(namespace);
    if (!spec) throw new Error(`unknown namespace: ${namespace}`);
    if (!spec.tools.includes(tool)) throw new Error(`tool ${tool} not exposed by ${spec.name}`);
    return { server: spec.name, namespace, tool };
  }

  specForNamespace(namespace: string): ServerSpec {
    const s = this.byNamespace.get(namespace);
    if (!s) throw new Error(`unknown namespace: ${namespace}`);
    return s;
  }
}

// Hardcoded trust map mirrors the TRUST= metadata declared in each server.
// 101: the gateway must know trust independently of the (untrusted) payload.
const TRUST_MAP: Record<string, TrustLevel> = {
  "support.get_ticket": "untrusted",
  "support.get_customer": "trusted",
  "billing.get_order": "trusted",
  "billing.issue_refund": "privileged",
};

export function trustLevelFor(namespacedTool: string, description?: string): TrustLevel {
  // Prefer parsing the server-declared description; fall back to the static map.
  if (description) {
    const m = description.match(/TRUST=(untrusted|trusted|privileged)/);
    if (m) return m[1] as TrustLevel;
  }
  return TRUST_MAP[namespacedTool] ?? "trusted";
}
