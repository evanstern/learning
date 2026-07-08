/**
 * ============================================================================
 *  WEB UI SERVER  —  npm run web
 * ============================================================================
 *
 *  A tiny zero-dependency HTTP server (node:http) that serves ui.html and a
 *  single JSON endpoint, POST /run, which executes a chosen scenario through
 *  the SAME orchestration graph the CLI uses and returns the trace + decision.
 *
 *  The UI lets you pick the benign vs malicious ticket, click Run, and watch
 *  the step-by-step trace, taint tags, the gate decision, and final outcome.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { runScenario } from "../orchestrator/graph.js";
import type { TrustedUserRequest } from "../orchestrator/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_PATH = join(__dirname, "ui.html");
const PORT = Number(process.env.PORT ?? 3103);

const REQUESTS: Record<string, TrustedUserRequest> = {
  benign: { intent: "Process this refund ticket.", ticketId: "tkt_123" },
  malicious: { intent: "Process this refund ticket.", ticketId: "tkt_666" },
};

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      const html = readFileSync(UI_PATH, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "POST" && req.url === "/run") {
      const body = await readBody(req);
      const parsed = body ? (JSON.parse(body) as { scenario?: string }) : {};
      const scenario = parsed.scenario === "malicious" ? "malicious" : "benign";
      const request = REQUESTS[scenario]!;

      const result = await runScenario(request);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          scenario,
          mode: process.env.ANTHROPIC_API_KEY ? "live" : "offline",
          ...result,
        }),
      );
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`MCP 103 web UI → http://localhost:${PORT}`);
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? "Mode: LIVE (real LLM calls)."
      : "Mode: OFFLINE (deterministic fallbacks; policy gate still enforced).",
  );
});
