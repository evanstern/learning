// Flat-JSON store. READS are real; WRITES are SIMULATED.
// 102: the store is the single source of truth shared by both MCP servers.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
  classification: string;
  body: string;
}

interface BillingDb {
  customers: Customer[];
  orders: Order[];
  tickets: Ticket[];
}

// Resolve data/billing.json relative to this module, walking up out of src/store.
function resolveDataPath(): string {
  const here = dirname(fileURLToPath(import.meta.url)); // .../src/store
  return join(here, "..", "..", "data", "billing.json"); // .../data/billing.json
}

function load(): BillingDb {
  const raw = readFileSync(resolveDataPath(), "utf8");
  return JSON.parse(raw) as BillingDb;
}

export function getTicket(ticketId: string): Ticket {
  const t = load().tickets.find((x) => x.id === ticketId);
  if (!t) throw new Error(`ticket not found: ${ticketId}`);
  return t;
}

export function getCustomer(customerId: string): Customer {
  const c = load().customers.find((x) => x.id === customerId);
  if (!c) throw new Error(`customer not found: ${customerId}`);
  return c;
}

export function getOrder(orderId: string): Order {
  const o = load().orders.find((x) => x.id === orderId);
  if (!o) throw new Error(`order not found: ${orderId}`);
  return o;
}

export interface RefundReceipt {
  receiptId: string;
  orderId: string;
  amount: number;
  reason: string;
  simulated: true;
  issuedAt: string;
}

// WRITE is SIMULATED — we never mutate the JSON. 104: privileged side-effects
// are isolated and observable so the demo can prove the gate held.
export function issueRefund(orderId: string, amount: number, reason: string): RefundReceipt {
  getOrder(orderId); // validate the order exists before "issuing"
  return {
    receiptId: `rcpt_${Math.random().toString(36).slice(2, 10)}`,
    orderId,
    amount,
    reason,
    simulated: true,
    issuedAt: new Date().toISOString(),
  };
}
