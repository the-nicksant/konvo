import type { z } from 'zod'

/** Action level determines whether a tool requires safety confirmation */
export type ActionLevel = 'read' | 'write' | 'destructive'

/** A tool that the AI agent can call during conversations */
export interface ToolDefinition<TParams extends z.ZodType = z.ZodType> {
  name: string
  description: string
  parameters: TParams
  execute: (args: z.infer<TParams>) => Promise<unknown>
  /** How to format the raw result for the LLM and the user */
  formatResponse?: (result: unknown) => string
  /** Safety classification — default 'read' */
  actionLevel: ActionLevel
}
