// Taint wrapper — 101: dual-LLM pattern separates untrusted data from trusted logic.
// Tainted<T> marks data that originated from an untrusted source so it can never
// be silently treated as a trusted instruction.
export type Tainted<T> = { value: T; tainted: true; source: string };

export function taint<T>(value: T, source: string): Tainted<T> {
  return { value, tainted: true, source };
}

export function untaint<T>(t: Tainted<T>): T {
  return t.value;
}

export function isTainted(x: unknown): x is Tainted<unknown> {
  return typeof x === "object" && x !== null && (x as { tainted?: unknown }).tainted === true;
}
