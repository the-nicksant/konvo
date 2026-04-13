import { LanguageModel } from 'ai';
import { A as AuthConfig, S as SessionStore } from './interface-EgWcPq1c.js';
export { a as AuthResult, b as Session, c as SessionId, U as UserIdentity, d as UserPermissions, W as WorkflowState } from './interface-EgWcPq1c.js';
import { C as ChannelAdapter } from './interface-N6n0avsR.js';
export { I as InboundContent, a as InboundMessage, O as Option, b as OutboundMessage } from './interface-N6n0avsR.js';
import { z } from 'zod';

/** Action level determines whether a tool requires safety confirmation */
type ActionLevel = 'read' | 'write' | 'destructive';
/** A tool that the AI agent can call during conversations */
interface ToolDefinition<TParams extends z.ZodType = z.ZodType> {
    name: string;
    description: string;
    parameters: TParams;
    execute: (args: z.infer<TParams>) => Promise<unknown>;
    /** How to format the raw result for the LLM and the user */
    formatResponse?: (result: unknown) => string;
    /** Safety classification — default 'read' */
    actionLevel: ActionLevel;
}

/** Context available to step functions during workflow execution */
interface WorkflowContext {
    /** Data collected so far across all steps */
    collectedData: Record<string, unknown>;
    /** Resolved customer identity, if auth provided one */
    customer: {
        id: string;
        name: string;
        phone: string;
        metadata: Record<string, unknown>;
    } | null;
}
/** A single step inside a workflow */
type WorkflowStep = ToolStep | AskUserStep | ConfirmationStep;
interface BaseStep {
    /** Step name — used as key in collectedData */
    name: string;
}
/** Execute an API tool and store the result */
interface ToolStep extends BaseStep {
    type: 'tool';
    /** Name of the registered tool to call */
    tool: string;
    /** Build the tool input from collected context */
    input: (ctx: WorkflowContext) => Record<string, unknown>;
    /** Message to send on successful execution */
    onSuccess?: string;
    /** Message to send when the tool returns an empty result */
    onEmptyResult?: {
        message: string;
        fallback?: string;
    };
    /** Message to send on error */
    onError?: string;
}
/** Send a message and wait for free-text or selection input */
interface AskUserStep extends BaseStep {
    type: 'ask_user';
    message: string | ((ctx: WorkflowContext) => string);
    /** If provided, renders as interactive options (buttons or list) */
    options?: (ctx: WorkflowContext) => Array<{
        id: string;
        label: string;
    }>;
}
/** Send a yes/no confirmation prompt and wait */
interface ConfirmationStep extends BaseStep {
    type: 'confirmation';
    message: string | ((ctx: WorkflowContext) => string);
    confirmLabel?: string;
    cancelLabel?: string;
}
/** A full workflow definition */
interface WorkflowDefinition {
    /** Unique name used to identify and trigger the workflow */
    name: string;
    /** Natural language description used in the system prompt */
    trigger: string;
    steps: WorkflowStep[];
    /** Timeout behavior */
    timeout?: {
        minutes: number;
        message: string;
    };
    /** How to handle off-topic messages mid-workflow */
    offTopic?: 'pause_and_address' | 'ignore' | 'cancel';
}
/**
 * Define a multi-step conversation workflow.
 *
 * @example
 * ```typescript
 * const booking = defineWorkflow({
 *   name: 'newBooking',
 *   trigger: 'User wants to book a new appointment',
 *   steps: [
 *     step('pickDate', { type: 'ask_user', message: 'What date works for you?' }),
 *   ],
 * })
 * ```
 */
declare function defineWorkflow(config: WorkflowDefinition): WorkflowDefinition;
/**
 * Helper to define a single workflow step with type inference.
 *
 * @example
 * ```typescript
 * step('confirm', { type: 'confirmation', message: ctx => `Book on ${ctx.collectedData.date}?` })
 * ```
 */
declare function step(name: string, config: Omit<WorkflowStep, 'name'>): WorkflowStep;

/** Safety configuration for tool execution */
interface SafetyConfig {
    /**
     * Per-tool action level overrides.
     * Any tool not listed defaults to 'read'.
     * @example { deleteAppointment: 'destructive', createBooking: 'write' }
     */
    actionLevels?: Record<string, 'read' | 'write' | 'destructive'>;
}
/** Top-level framework configuration */
interface KonvoConfig {
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

/**
 * The main framework entry point. Wires together all tiers and starts the HTTP server.
 *
 * @example
 * ```typescript
 * const agent = new Konvo({ agent: { model, instructions }, tools: [...], channel })
 * agent.listen(3000)
 * ```
 */
declare class Konvo {
    private readonly config;
    constructor(config: KonvoConfig);
    /** Start the HTTP server on the given port */
    listen(_port: number): Promise<void>;
    /** Gracefully stop the server */
    stop(): Promise<void>;
}

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
declare function defineTool<TParams extends z.ZodType>(config: DefineToolConfig<TParams>): ToolDefinition<TParams>;

/** Base class for all konvo errors. Use instanceof checks to handle specific cases. */
declare class KonvoError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
/** Thrown when the KonvoConfig fails validation at construction time */
declare class ConfigValidationError extends KonvoError {
    constructor(field: string, message: string);
}
/** Thrown when a tool's execute() function throws or returns a non-OK response */
declare class ToolExecutionError extends KonvoError {
    constructor(toolName: string, cause: unknown);
}
/** Thrown when the auth gate blocks processing */
declare class AuthDeniedError extends KonvoError {
    constructor(reason: string);
}
/** Thrown when a session is expected but not found in the store */
declare class SessionNotFoundError extends KonvoError {
    constructor(sessionId: string);
}
/** Thrown when a workflow step fails */
declare class WorkflowError extends KonvoError {
    constructor(workflowName: string, stepName: string, message: string);
}

export { type ActionLevel, AuthConfig, AuthDeniedError, ChannelAdapter, ConfigValidationError, Konvo, type KonvoConfig, KonvoError, type SafetyConfig, SessionNotFoundError, SessionStore, type ToolDefinition, ToolExecutionError, type WorkflowContext, type WorkflowDefinition, WorkflowError, type WorkflowStep, defineTool, defineWorkflow, step };
