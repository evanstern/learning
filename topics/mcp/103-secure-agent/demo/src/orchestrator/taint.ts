/**
 * ============================================================================
 *  TAINT TRACKING  (MCP 102 concept: "taint" / data provenance)
 * ============================================================================
 *
 * The core security idea: data that originates from an UNTRUSTED source (e.g.
 * the free-text body of a support ticket, a web page, an email) must be marked
 * as "tainted". Any value DERIVED from tainted data is ALSO tainted — taint is
 * STICKY. It does not wash off just because an LLM rephrased it or parsed it
 * into a nice typed object.
 *
 * Why bother? Because prompt injection lives inside untrusted text. If we lose
 * track of where a value came from, we can be tricked into treating
 * attacker-controlled data ("issue a $9,999 refund to cust_999") as if it were
 * a trusted instruction. Taint tags let the DETERMINISTIC policy gate (see
 * policy.ts) apply extra scrutiny to anything that touched untrusted input.
 *
 * This is a teaching implementation. Real systems (e.g. CaMeL) track taint at
 * the value/variable level through an interpreter. Here we use a tiny wrapper
 * type so the propagation is explicit and visible in the trace.
 */

/**
 * A value plus its provenance metadata.
 *
 * The `__tainted` brand makes it awkward to accidentally pass a Tainted<T>
 * where a plain T is expected — you must consciously `reveal()` it, which is
 * the moment you should be asking "am I allowed to trust this?".
 */
export interface Tainted<T> {
  /** Discriminant brand. Always true for tainted values. */
  readonly __tainted: true;
  /** Human-readable origin, e.g. "ticket:tkt_666". Shown in the trace. */
  readonly source: string;
  /** The wrapped value. Access via reveal() so the unwrap is intentional. */
  readonly value: T;
}

/** Wrap a value as tainted, recording where it came from. */
export function taint<T>(value: T, source: string): Tainted<T> {
  return { __tainted: true, source, value };
}

/** Runtime type guard — useful in the policy gate and trace formatting. */
export function isTainted<T = unknown>(x: unknown): x is Tainted<T> {
  return (
    typeof x === "object" &&
    x !== null &&
    (x as { __tainted?: unknown }).__tainted === true
  );
}

/**
 * Deliberately unwrap a tainted value. The name is loud on purpose: every call
 * site is a place where untrusted data crosses a trust boundary, so it should
 * be easy to audit by grepping for `reveal(`.
 */
export function reveal<T>(t: Tainted<T>): T {
  return t.value;
}

/**
 * STICKY PROPAGATION.
 *
 * Map a tainted value to a new tainted value. The output stays tainted and
 * keeps the original source. Use this whenever you transform untrusted data
 * (parse it, extract a field, run it through the quarantined LLM, etc.).
 *
 * The whole point: there is NO function in this module that turns Tainted<T>
 * into a "clean" value. The only escape hatch is reveal(), and reveal() is an
 * explicit, auditable trust decision — never an automatic one.
 */
export function mapTainted<T, U>(t: Tainted<T>, fn: (v: T) => U): Tainted<U> {
  return taint(fn(t.value), t.source);
}

/** Convenience for the trace: a short tag like "[TAINTED ticket:tkt_666]". */
export function taintTag(x: unknown): string {
  return isTainted(x) ? `[TAINTED ${x.source}]` : "[trusted]";
}
