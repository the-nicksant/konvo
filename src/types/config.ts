import type { LanguageModel } from "ai";
import type { AuthConfig } from "../auth/types.js";
import type { ChannelAdapter } from "../channels/interface.js";
import type { RateLimiter } from "../safety/guards.js";
import type { SessionStore } from "../session/stores/interface.js";
import type { ToolDefinition } from "../tools/types.js";
import type { ActionLevel } from "../tools/types.js";
import type { WorkflowDefinition } from "./workflow.js";

/** Safety configuration for tool execution */
export interface SafetyConfig {
  /**
   * Per-tool action level overrides. Useful when you want stricter safety
   * for specific tools without editing their defineTool() call.
   * Any tool not listed uses the level declared in its definition.
   * @example { deleteAppointment: 'destructive', createBooking: 'write' }
   */
  actionLevels?: Record<string, ActionLevel>;

  /**
   * Rate limiter instance for per-session tool call throttling.
   * Must be shared across requests to accumulate counts.
   * @example new RateLimiter()
   */
  rateLimiter?: RateLimiter;

  /**
   * Maximum tool calls per minute per session.
   * Required when rateLimiter is set — omitting it disables rate limiting.
   */
  maxCallsPerMinute?: number;
}

/** Top-level framework configuration */
export interface KonvoConfig {
  /** LLM model and agent personality */
  agent: {
    /**
     * AI SDK model instance.
     * @example openai('gpt-4o-mini')
     */
    model: LanguageModel;
    /** System prompt defining the agent's persona, rules, and domain context */
    instructions: string;
    /**
     * Max tool-calling iterations per turn.
     * Default: 5. Set higher for complex multi-tool chains.
     */
    maxSteps?: number;
  };

  /** Channel adapter (e.g. WhatsApp) */
  channel: ChannelAdapter;

  /** Tools the agent can call. Created with defineTool(). */
  tools: ToolDefinition[];

  /** Multi-step conversation workflows. Created with defineWorkflow(). */
  workflows?: WorkflowDefinition[];

  /** Authentication and authorization pipeline */
  auth?: AuthConfig;

  /**
   * Session persistence store.
   * Defaults to MemoryStore (with a warning). Use SQLiteStore for production.
   */
  store?: SessionStore;

  /** Safety rules for tool execution */
  safety?: SafetyConfig;

  /**
   * Max messages to keep in conversation history per session.
   * Default: 20. Higher values increase LLM token usage.
   */
  historyWindow?: number;
}
