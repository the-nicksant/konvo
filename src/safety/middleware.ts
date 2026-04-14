import { ConfirmationRequiredError } from "../errors.js";
import type { ToolDefinition } from "../tools/types.js";
import { type RateLimiter, requiresConfirmation } from "./guards.js";

export interface SafetyConfig {
  /**
   * Rate limiter instance. Must be shared across calls to accumulate counts.
   * Omit to disable rate limiting.
   */
  rateLimiter?: RateLimiter;
  /** Maximum tool calls per minute per session. Required when rateLimiter is set. */
  maxCallsPerMinute?: number;
}

/**
 * Run all safety checks before a tool executes.
 *
 * Checks (in order):
 * 1. Rate limit — throws RateLimitError if the session has exceeded its call quota
 * 2. Confirmation — throws ConfirmationRequiredError if the tool's action level
 *    requires user consent and the caller has not indicated prior confirmation
 *
 * @param tool        Tool about to be executed
 * @param sessionId   Session making the call (used for rate limit tracking)
 * @param confirmed   Whether the user has already confirmed this action
 * @param config      Safety configuration (rate limits, etc.)
 * @param now         Current timestamp in ms (injectable for testing)
 */
export function checkBeforeExecution(
  tool: ToolDefinition,
  sessionId: string,
  confirmed: boolean,
  config: SafetyConfig = {},
  now = Date.now(),
): void {
  if (config.rateLimiter && config.maxCallsPerMinute !== undefined) {
    config.rateLimiter.check(sessionId, config.maxCallsPerMinute, now);
  }

  if (requiresConfirmation(tool.actionLevel) && !confirmed) {
    throw new ConfirmationRequiredError(tool.name, tool.actionLevel);
  }
}
