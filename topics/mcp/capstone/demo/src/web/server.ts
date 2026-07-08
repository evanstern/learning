// Web server: serves ui.html, GET /stream (SSE), POST /next (step-by-step gate), POST /run (batch).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Gateway } from "../gateway/gateway.js";
import { runScenario } from "../orchestrator/graph.js";
import type { StreamEvent } from "../gateway/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const uiPath = join(here, "ui.html");
const PORT = 3104;
const mode = process.env.ANTHROPIC_API_KEY ? "live" : "offline";

// One Gateway shared across requests — keeps MCP subprocesses warm.
const gateway = new Gateway();

// Step-by-step gate: each run gets a slot that resolves when POST /next arrives.
const pendingNext = new Map<string, () => void>();

function ticketFor(scenario: string) {
  return scenario === "malicious" ? "tkt_666" : "tkt_123";
}

// How long to pause between steps in auto mode (ms). 0 = as fast as possible.
const AUTO_STEP_DELAY = Number(process.env.STEP_DELAY_MS ?? 600);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // ── serve UI ──────────────────────────────────────────────────────────────
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(uiPath, "utf8"));
    return;
  }

  // ── SSE streaming endpoint ────────────────────────────────────────────────
  // Query params:
  //   scenario    benign | malicious
  //   stepByStep  true | false (default false)
  //   runId       unique id for this run (used with POST /next)
  if (req.method === "GET" && url.pathname === "/stream") {
    const scenario = url.searchParams.get("scenario") ?? "benign";
    const stepByStep = url.searchParams.get("stepByStep") === "true";
    const runId = url.searchParams.get("runId") ?? Math.random().toString(36).slice(2);
    const ticketId = ticketFor(scenario);

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "access-control-allow-origin": "*",
    });

    // send() is async: after step_done it either pauses (step-by-step) or
    // waits AUTO_STEP_DELAY ms (auto mode) before resolving — giving the
    // graph time to receive the gate signal before continuing.
    const send = async (e: StreamEvent): Promise<void> => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);

      if (e.t === "step_done") {
        if (stepByStep) {
          // Signal the UI that we're waiting, then block until POST /next.
          res.write(`data: ${JSON.stringify({ t: "step_waiting", step: e.step })}\n\n`);
          await new Promise<void>((resolve) => {
            pendingNext.set(runId, resolve);
          });
        } else if (AUTO_STEP_DELAY > 0) {
          await new Promise((r) => setTimeout(r, AUTO_STEP_DELAY));
        }
      }
    };

    send({ t: "run_start", scenario, ticketId, mode });

    try {
      const result = await runScenario(
        gateway,
        { intent: "process_refund", ticketId, principal: "orchestrator" },
        send,
      );
      await send({ t: "run_done", outcome: result.outcome, policy: result.policy, receipt: result.receipt });
    } catch (err) {
      await send({ t: "error", message: String(err) });
    } finally {
      pendingNext.delete(runId);
    }

    res.end();
    return;
  }

  // ── POST /next — advance one step in step-by-step mode ───────────────────
  if (req.method === "POST" && url.pathname === "/next") {
    const runId = url.searchParams.get("runId") ?? "";
    const resolve = pendingNext.get(runId);
    if (resolve) {
      pendingNext.delete(runId);
      resolve();
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    } else {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("no pending run");
    }
    return;
  }

  // ── batch /run (for curl / CLI testing) ──────────────────────────────────
  if (req.method === "POST" && url.pathname === "/run") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { scenario } = JSON.parse(body || "{}") as { scenario?: string };
        const ticketId = ticketFor(scenario ?? "benign");
        const result = await runScenario(gateway, {
          intent: "process_refund",
          ticketId,
          principal: "orchestrator",
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ticketId, ...result }));
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`MCP capstone web UI → http://localhost:${PORT}`);
  console.log(`Mode: ${mode} | Auto step delay: ${AUTO_STEP_DELAY}ms`);
});
