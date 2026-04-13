import { z } from "zod";
import { defineTool } from "../../src/tools/define-tool.js";

export const getOrderStatus = defineTool({
  name: "getOrderStatus",
  description: "Use when the user asks about the status of their order.",
  parameters: z.object({ orderId: z.string() }),
  execute: async ({ orderId }) => ({ orderId, status: "shipped" }),
  actionLevel: "read",
});

export const createOrder = defineTool({
  name: "createOrder",
  description: "Use when the user wants to place a new order.",
  parameters: z.object({ item: z.string(), quantity: z.number() }),
  execute: async ({ item, quantity }) => ({ orderId: "ord_123", item, quantity }),
  actionLevel: "write",
});

export const deleteOrder = defineTool({
  name: "deleteOrder",
  description: "Use when the user wants to cancel and delete an order.",
  parameters: z.object({ orderId: z.string() }),
  execute: async () => ({ deleted: true }),
  actionLevel: "destructive",
});
