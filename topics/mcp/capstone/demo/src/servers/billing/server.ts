// billing MCP server.
// 104: issue_refund is PRIVILEGED — it performs a (simulated) money-moving
// side-effect. Its TRUST=privileged metadata makes the gateway refuse it unless
// the caller explicitly passes allowPrivileged (the policy gate is the gate).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getOrder, issueRefund } from "../../store/billing.js";

const server = new McpServer({ name: "billing", version: "1.0.0" });

server.tool(
  "get_order",
  "Fetch an order by id. TRUST=trusted (system-of-record data).",
  { orderId: z.string() },
  async ({ orderId }) => {
    const order = getOrder(orderId);
    return { content: [{ type: "text", text: JSON.stringify(order) }] };
  },
);

server.tool(
  "issue_refund",
  "Issue a (SIMULATED) refund for an order. TRUST=privileged (money-moving side-effect).",
  { orderId: z.string(), amount: z.number(), reason: z.string() },
  async ({ orderId, amount, reason }) => {
    const receipt = issueRefund(orderId, amount, reason);
    return { content: [{ type: "text", text: JSON.stringify(receipt) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
