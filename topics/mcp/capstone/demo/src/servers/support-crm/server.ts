// support-crm MCP server.
// 101: get_ticket returns UNTRUSTED data (free-text written by the customer) —
// its TRUST=untrusted metadata tells the gateway to taint the output.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getTicket, getCustomer } from "../../store/billing.js";

const server = new McpServer({ name: "support-crm", version: "1.0.0" });

server.tool(
  "get_ticket",
  "Fetch a support ticket by id. TRUST=untrusted (contains attacker-controllable free text).",
  { ticketId: z.string() },
  async ({ ticketId }) => {
    const ticket = getTicket(ticketId);
    return { content: [{ type: "text", text: JSON.stringify(ticket) }] };
  },
);

server.tool(
  "get_customer",
  "Fetch a customer record by id. TRUST=trusted (system-of-record data).",
  { customerId: z.string() },
  async ({ customerId }) => {
    const customer = getCustomer(customerId);
    return { content: [{ type: "text", text: JSON.stringify(customer) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
