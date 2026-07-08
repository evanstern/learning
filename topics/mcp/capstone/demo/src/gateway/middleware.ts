// Gateway middleware chain.
// 102: cross-cutting concerns (logging, latency) run for EVERY call, uniformly.
import type { TraceEvent } from "./types.js";

export interface MiddlewareContext {
  namespacedTool: string;
  server: string;
  namespace: string;
  emit: (e: TraceEvent) => void;
}

export type Middleware = (ctx: MiddlewareContext, next: () => Promise<void>) => Promise<void>;

// Logging middleware: records that a call is being routed.
export const loggingMiddleware: Middleware = async (ctx, next) => {
  ctx.emit({ kind: "route", tool: ctx.namespacedTool, server: ctx.server, namespace: ctx.namespace });
  await next();
};

// Latency middleware: measures wall-clock time and (optionally) injects delay.
export const latencyMiddleware: Middleware = async (ctx, next) => {
  const delay = Number(process.env.GATEWAY_LATENCY_MS ?? "0");
  const start = Date.now();
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  await next();
  ctx.emit({ kind: "latency", ms: Date.now() - start, tool: ctx.namespacedTool });
};

export async function runMiddleware(
  chain: Middleware[],
  ctx: MiddlewareContext,
  terminal: () => Promise<void>,
): Promise<void> {
  let i = -1;
  const dispatch = async (idx: number): Promise<void> => {
    if (idx <= i) throw new Error("next() called multiple times");
    i = idx;
    const mw = chain[idx];
    if (!mw) return terminal();
    await mw(ctx, () => dispatch(idx + 1));
  };
  await dispatch(0);
}
