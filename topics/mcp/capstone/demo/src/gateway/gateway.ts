// Gateway — the single choke point for all MCP tool calls.
// 102/104: routing + middleware + auth + privilege gate + taint + tracing all
// live here. The orchestrator never talks to an MCP server directly.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { NamespaceRouter, trustLevelFor } from "./router.js";
import { loggingMiddleware, latencyMiddleware, runMiddleware } from "./middleware.js";
import type { Middleware } from "./middleware.js";
import { checkAuth } from "./auth.js";
import { taint } from "../orchestrator/taint.js";
import type {
  CallOptions,
  GatewayCallResult,
  ServersConfig,
  ServerSpec,
  TraceEvent,
  TrustLevel,
} from "./types.js";

function loadServersConfig(): ServersConfig {
  const here = dirname(fileURLToPath(import.meta.url)); // .../src/gateway
  const cfgPath = join(here, "..", "..", "config", "servers.json");
  return JSON.parse(readFileSync(cfgPath, "utf8")) as ServersConfig;
}

// Subprocess env: ensure tsx (homebrew/volta) is on PATH for the spawned server.
function subprocessEnv(): Record<string, string> {
  const volta = process.env.VOLTA_HOME ?? `${process.env.HOME}/.volta`;
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  env.PATH = `/opt/homebrew/bin:${volta}/bin:${process.env.PATH ?? ""}`;
  return env;
}

export class Gateway {
  private router: NamespaceRouter;
  private specs: ServerSpec[];
  private clients = new Map<string, Client>();
  private middleware: Middleware[] = [loggingMiddleware, latencyMiddleware];

  constructor() {
    const cfg = loadServersConfig();
    this.specs = cfg.servers;
    this.router = new NamespaceRouter(cfg.servers);
  }

  // Lazily spawn each MCP server subprocess on first use.
  private async clientFor(serverName: string): Promise<Client> {
    const existing = this.clients.get(serverName);
    if (existing) return existing;

    const spec = this.specs.find((s) => s.name === serverName);
    if (!spec) throw new Error(`no spec for server ${serverName}`);

    const here = dirname(fileURLToPath(import.meta.url));
    const demoRoot = join(here, "..", ".."); // CWD for subprocess = demo root

    const transport = new StdioClientTransport({
      command: spec.command,
      args: spec.args,
      cwd: demoRoot,
      env: subprocessEnv(),
    });
    const client = new Client({ name: `gateway->${serverName}`, version: "1.0.0" });
    await client.connect(transport);
    this.clients.set(serverName, client);
    return client;
  }

  async call(
    namespacedTool: string,
    args: Record<string, unknown>,
    principal: string,
    options: CallOptions = {},
  ): Promise<GatewayCallResult> {
    const events: TraceEvent[] = [];
    // emit fires the callback immediately (for SSE streaming) AND collects for callers.
    const emit = (e: TraceEvent, rawPayload?: unknown) => {
      events.push(e);
      options.onEvent?.(e, rawPayload);
    };

    const route = this.router.resolve(namespacedTool);
    const trustLevel: TrustLevel = trustLevelFor(namespacedTool);

    // 104: refuse privileged tools unless caller explicitly opted in.
    if (trustLevel === "privileged" && !options.allowPrivileged) {
      throw new Error(`privileged tool ${namespacedTool} refused (allowPrivileged not set)`);
    }

    let result: GatewayCallResult | undefined;

    await runMiddleware(
      this.middleware,
      { namespacedTool, server: route.server, namespace: route.namespace, emit },
      async () => {
        // Auth check inside the chain so latency wraps it too.
        const auth = checkAuth(principal, namespacedTool, trustLevel, emit);
        if (!auth.granted) {
          throw new Error(`auth denied: ${principal} lacks ${auth.scope} for ${namespacedTool}`);
        }

        const client = await this.clientFor(route.server);
        const raw = await client.callTool({ name: route.tool, arguments: args });

        // MCP returns content blocks; we expect a single JSON text block.
        const content = (raw.content ?? []) as Array<{ type: string; text?: string }>;
        const textBlock = content.find((c) => c.type === "text");
        const data: unknown = textBlock?.text ? JSON.parse(textBlock.text) : raw;

        const tainted = trustLevel === "untrusted";
        emit({ kind: "call", tool: namespacedTool, tainted, trustLevel });

        // 101: taint untrusted output at the boundary so downstream logic must
        // treat it as data, never as instructions.
        const payload = tainted ? taint(data, namespacedTool) : data;

        // Pass rawPayload so the SSE stream can show the actual response data.
        emit({ kind: "result", tool: namespacedTool, summary: summarize(data), rawPayload: data }, data);

        result = { data: payload, trustLevel, tainted, events };
      },
    );

    if (!result) throw new Error(`gateway call produced no result for ${namespacedTool}`);
    return result;
  }

  async close(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.close();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }
}

function summarize(data: unknown): string {
  const s = JSON.stringify(data);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}
