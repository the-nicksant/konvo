import { RateLimitError } from "../errors.js";
import type { ActionLevel } from "../tools/types.js";

const WINDOW_MS = 60_000;

/** Returns true if the action level requires explicit user confirmation before execution */
export function requiresConfirmation(actionLevel: ActionLevel): boolean {
  return actionLevel === "write" || actionLevel === "destructive";
}

/**
 * Tracks per-session tool call counts within a rolling 1-minute window.
 * Instantiate once and share across requests for the same agent instance.
 */
export class RateLimiter {
  private readonly counts = new Map<string, { count: number; windowStart: number }>();

  /**
   * Record a tool call for the given session and throw if the rate limit is exceeded.
   *
   * @param sessionId       Session to track
   * @param maxPerMinute    Maximum allowed calls per 1-minute window
   * @param now             Current timestamp in ms (injectable for testing)
   */
  check(sessionId: string, maxPerMinute: number, now = Date.now()): void {
    const entry = this.counts.get(sessionId);

    if (!entry || now - entry.windowStart >= WINDOW_MS) {
      this.counts.set(sessionId, { count: 1, windowStart: now });
      return;
    }

    if (entry.count >= maxPerMinute) {
      throw new RateLimitError(
        `Rate limit exceeded: max ${maxPerMinute} tool calls per minute`,
      );
    }

    entry.count++;
  }

  /** Reset all counters — useful for testing */
  reset(): void {
    this.counts.clear();
  }
}
