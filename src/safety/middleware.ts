import { ConfirmationRequiredError } from "../errors.js";
import type { SafetyConfig } from "../types/config.js";
import type { ToolDefinition } from "../tools/types.js";
import { requiresConfirmation } from "./guards.js";

export type { SafetyConfig };

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
  if (config.rateLimiter) {
    if (config.maxCallsPerMinute === undefined) {
      throw new Error(
        "SafetyConfig.rateLimiter is set but maxCallsPerMinute is missing. " +
          "Provide maxCallsPerMinute to enable rate limiting.",
      );
    }
    config.rateLimiter.check(sessionId, config.maxCallsPerMinute, now);
  }

  if (requiresConfirmation(tool.actionLevel) && !confirmed) {
    throw new ConfirmationRequiredError(tool.name, tool.actionLevel);
  }
}
