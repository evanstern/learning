/**
 * ============================================================================
 *  BILLING STORE  — the data layer
 * ============================================================================
 *
 *  READ-REAL / WRITE-SIMULATED.
 *
 *  - READS are real: customers, orders, and tickets are loaded from
 *    data/billing.json on disk. This keeps the demo honest — the agent is
 *    reasoning over actual data, not stubs.
 *
 *  - WRITES are SIMULATED: issueRefund() does NOT mutate billing.json and does
 *    NOT call any payment API. It logs what *would* happen and returns a fake
 *    receipt. This is deliberate:
 *      1. Safety — a teaching demo about prompt injection must never be able to
 *         actually move money, even by accident.
 *      2. Focus — the interesting part is the POLICY GATE deciding whether the
 *         write is allowed, not the persistence mechanics.
 *
 *  In MCP-102 terms, issue_refund is the PRIVILEGED / side-effecting capability.
 *  The whole architecture exists to make sure it only fires on trusted,
 *  policy-approved input.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// src/billing/store.ts -> ../../data/billing.json
const DB_PATH = join(__dirname, "..", "..", "data", "billing.json");

export interface Customer {
  id: string;
  name: string;
  email: string;
}

export interface Order {
  id: string;
  customerId: string;
  amount: number;
  item: string;
}

export interface Ticket {
  id: string;
  customerId: string;
  orderId: string;
  classification: "BENIGN" | "MALICIOUS";
  /** UNTRUSTED free text. Treat as attacker-controlled. */
  body: string;
}

interface BillingDb {
  customers: Customer[];
  orders: Order[];
  tickets: Ticket[];
}

/** Real read from disk every call (small file; keeps it simple + honest). */
function loadDb(): BillingDb {
  const raw = readFileSync(DB_PATH, "utf8");
  return JSON.parse(raw) as BillingDb;
}

// ---------------------------------------------------------------------------
//  READS  (real)
// ---------------------------------------------------------------------------

export function getTicket(ticketId: string): Ticket | undefined {
  return loadDb().tickets.find((t) => t.id === ticketId);
}

export function getOrder(orderId: string): Order | undefined {
  return loadDb().orders.find((o) => o.id === orderId);
}

export function getCustomer(customerId: string): Customer | undefined {
  return loadDb().customers.find((c) => c.id === customerId);
}

// ---------------------------------------------------------------------------
//  WRITE  (SIMULATED — does not persist, does not call any payment system)
// ---------------------------------------------------------------------------

export interface RefundReceipt {
  receiptId: string;
  orderId: string;
  amount: number;
  reason: string;
  status: "SIMULATED_OK";
  /** Loud marker so nobody mistakes this for a real money movement. */
  simulated: true;
  issuedAt: string;
}

/**
 * SIMULATED write. By the time we reach here the deterministic policy gate has
 * already approved the refund — this function does not re-check policy and does
 * not touch the LLM. It just records the (fake) effect.
 */
export function issueRefund(input: {
  orderId: string;
  amount: number;
  reason: string;
}): RefundReceipt {
  const receipt: RefundReceipt = {
    receiptId: `rcpt_sim_${Math.random().toString(36).slice(2, 10)}`,
    orderId: input.orderId,
    amount: input.amount,
    reason: input.reason,
    status: "SIMULATED_OK",
    simulated: true,
    issuedAt: new Date().toISOString(),
  };

  // The "write": a log line, not a DB mutation.
  console.error(
    `[store] SIMULATED refund issued: $${input.amount.toFixed(2)} for ${input.orderId} ` +
      `(receipt ${receipt.receiptId}). No money moved; billing.json unchanged.`,
  );

  return receipt;
}
