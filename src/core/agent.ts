import type { KonvoConfig } from '../types/config.js'
import { ConfigValidationError } from '../errors.js'

/**
 * The main framework entry point. Wires together all tiers and starts the HTTP server.
 *
 * @example
 * ```typescript
 * const agent = new Konvo({ agent: { model, instructions }, tools: [...], channel })
 * agent.listen(3000)
 * ```
 */
export class Konvo {
  private readonly config: KonvoConfig

  constructor(config: KonvoConfig) {
    validateConfig(config)
    this.config = config
  }

  /** Start the HTTP server on the given port */
  async listen(_port: number): Promise<void> {
    // Implementation in Step 10
    throw new Error('Not yet implemented')
  }

  /** Gracefully stop the server */
  async stop(): Promise<void> {
    // Implementation in Step 10
  }
}

function validateConfig(config: KonvoConfig): void {
  if (!config.agent) {
    throw new ConfigValidationError('agent', 'required')
  }
  if (!config.agent.model) {
    throw new ConfigValidationError(
      'agent.model',
      'required — pass an AI SDK model, e.g. openai("gpt-4o-mini")',
    )
  }
  if (!config.agent.instructions) {
    throw new ConfigValidationError('agent.instructions', 'required — provide a system prompt')
  }
  if (!config.channel) {
    throw new ConfigValidationError('channel', 'required — provide a channel adapter')
  }
  if (!config.tools || config.tools.length === 0) {
    throw new ConfigValidationError('tools', 'at least one tool is required')
  }
}
