import type { z } from "zod";
import type { ActionLevel, ToolDefinition } from "./types.js";

interface DefineToolConfig<TParams extends z.ZodType> {
  name: string;
  /**
   * LLM-optimized description. Write as instruction: "Use when the user wants to..."
   * The LLM selects tools based solely on this text.
   */
  description: string;
  parameters: TParams;
  execute: (args: z.infer<TParams>) => Promise<unknown>;
  /** How to format the raw API result for display. Optional. */
  formatResponse?: (result: unknown) => string;
  /**
   * Safety classification.
   * - 'read' — no confirmation required (default)
   * - 'write' — modifies data, may require confirmation
   * - 'destructive' — irreversible, always requires confirmation
   */
  actionLevel?: ActionLevel;
}

/**
 * Define a tool the AI agent can call during conversations.
 *
 * @example
 * ```typescript
 * const checkStatus = defineTool({
 *   name: 'checkOrderStatus',
 *   description: 'Use when the user asks about their order status.',
 *   parameters: z.object({ orderId: z.string() }),
 *   execute: async ({ orderId }) => fetchOrder(orderId),
 * })
 * ```
 */
export function defineTool<TParams extends z.ZodType>(
  config: DefineToolConfig<TParams>,
): ToolDefinition<TParams> {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute,
    actionLevel: config.actionLevel ?? "read",
    ...(config.formatResponse !== undefined && { formatResponse: config.formatResponse }),
  };
}
