import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfirmationRequiredError, RateLimitError } from "../../../src/errors.js";
import { RateLimiter, requiresConfirmation } from "../../../src/safety/guards.js";
import { checkBeforeExecution } from "../../../src/safety/middleware.js";
import { defineTool } from "../../../src/tools/define-tool.js";

// ---------------------------------------------------------------------------
// Test tools
// ---------------------------------------------------------------------------

const readTool = defineTool({
  name: "listItems",
  description: "List items",
  parameters: z.object({}),
  execute: async () => [],
  actionLevel: "read",
});

const writeTool = defineTool({
  name: "createItem",
  description: "Create an item",
  parameters: z.object({ name: z.string() }),
  execute: async () => ({ id: "1" }),
  actionLevel: "write",
});

const destructiveTool = defineTool({
  name: "deleteItem",
  description: "Delete an item",
  parameters: z.object({ id: z.string() }),
  execute: async () => ({ deleted: true }),
  actionLevel: "destructive",
});

const SESSION_ID = "wa_5511999887766";

// ---------------------------------------------------------------------------
// requiresConfirmation
// ---------------------------------------------------------------------------

describe("requiresConfirmation", () => {
  it("returns false for read action level", () => {
    expect(requiresConfirmation("read")).toBe(false);
  });

  it("returns true for write action level", () => {
    expect(requiresConfirmation("write")).toBe(true);
  });

  it("returns true for destructive action level", () => {
    expect(requiresConfirmation("destructive")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkBeforeExecution — action level
// ---------------------------------------------------------------------------

describe("checkBeforeExecution — action level", () => {
  it("allows read tools without confirmation", () => {
    expect(() => checkBeforeExecution(readTool, SESSION_ID, false)).not.toThrow();
  });

  it("throws ConfirmationRequiredError for write tools without confirmation", () => {
    expect(() => checkBeforeExecution(writeTool, SESSION_ID, false)).toThrow(
      ConfirmationRequiredError,
    );
  });

  it("allows write tools when confirmed", () => {
    expect(() => checkBeforeExecution(writeTool, SESSION_ID, true)).not.toThrow();
  });

  it("throws ConfirmationRequiredError for destructive tools without confirmation", () => {
    expect(() => checkBeforeExecution(destructiveTool, SESSION_ID, false)).toThrow(
      ConfirmationRequiredError,
    );
  });

  it("allows destructive tools when confirmed", () => {
    expect(() => checkBeforeExecution(destructiveTool, SESSION_ID, true)).not.toThrow();
  });

  it("ConfirmationRequiredError carries the tool name and action level", () => {
    let error: ConfirmationRequiredError | undefined;
    try {
      checkBeforeExecution(writeTool, SESSION_ID, false);
    } catch (e) {
      if (e instanceof ConfirmationRequiredError) error = e;
    }
    expect(error?.toolName).toBe("createItem");
    expect(error?.actionLevel).toBe("write");
  });
});

// ---------------------------------------------------------------------------
// checkBeforeExecution — rate limiting
// ---------------------------------------------------------------------------

describe("checkBeforeExecution — rate limiting", () => {
  it("allows calls within the rate limit", () => {
    const rateLimiter = new RateLimiter();
    const config = { rateLimiter, maxCallsPerMinute: 3 };
    expect(() => checkBeforeExecution(readTool, SESSION_ID, false, config, 0)).not.toThrow();
    expect(() => checkBeforeExecution(readTool, SESSION_ID, false, config, 1)).not.toThrow();
    expect(() => checkBeforeExecution(readTool, SESSION_ID, false, config, 2)).not.toThrow();
  });

  it("throws RateLimitError when limit is exceeded", () => {
    const rateLimiter = new RateLimiter();
    const config = { rateLimiter, maxCallsPerMinute: 2 };
    checkBeforeExecution(readTool, SESSION_ID, false, config, 0);
    checkBeforeExecution(readTool, SESSION_ID, false, config, 1);
    expect(() => checkBeforeExecution(readTool, SESSION_ID, false, config, 2)).toThrow(
      RateLimitError,
    );
  });

  it("resets the count after the 1-minute window", () => {
    const rateLimiter = new RateLimiter();
    const config = { rateLimiter, maxCallsPerMinute: 1 };
    checkBeforeExecution(readTool, SESSION_ID, false, config, 0);
    // Exceeds limit within window
    expect(() => checkBeforeExecution(readTool, SESSION_ID, false, config, 1000)).toThrow(
      RateLimitError,
    );
    // After 60 seconds the window resets
    expect(() =>
      checkBeforeExecution(readTool, SESSION_ID, false, config, 60_001),
    ).not.toThrow();
  });

  it("tracks limits per session independently", () => {
    const rateLimiter = new RateLimiter();
    const config = { rateLimiter, maxCallsPerMinute: 1 };
    checkBeforeExecution(readTool, "session_A", false, config, 0);
    // session_A is over limit, but session_B is fresh
    expect(() => checkBeforeExecution(readTool, "session_A", false, config, 1)).toThrow(
      RateLimitError,
    );
    expect(() => checkBeforeExecution(readTool, "session_B", false, config, 1)).not.toThrow();
  });

  it("rate limit check runs before confirmation check", () => {
    const rateLimiter = new RateLimiter();
    const config = { rateLimiter, maxCallsPerMinute: 1 };
    checkBeforeExecution(writeTool, SESSION_ID, true, config, 0); // confirmed, passes both
    // Now over rate limit — should throw RateLimitError, not ConfirmationRequiredError
    expect(() => checkBeforeExecution(writeTool, SESSION_ID, true, config, 1)).toThrow(
      RateLimitError,
    );
  });

  it("does not enforce rate limits when no config is provided", () => {
    // Call many times with no config — should never throw
    for (let i = 0; i < 100; i++) {
      expect(() => checkBeforeExecution(readTool, SESSION_ID, false)).not.toThrow();
    }
  });

  it("throws when rateLimiter is set without maxCallsPerMinute", () => {
    const rateLimiter = new RateLimiter();
    expect(() =>
      checkBeforeExecution(readTool, SESSION_ID, false, { rateLimiter }),
    ).toThrow("maxCallsPerMinute");
  });
});
