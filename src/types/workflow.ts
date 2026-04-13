import type { UserIdentity } from "../auth/types.js";

/** Context available to step functions during workflow execution */
export interface WorkflowContext {
  /** Data collected so far across all steps */
  collectedData: Record<string, unknown>;
  /** Resolved customer identity, if auth provided one */
  customer: UserIdentity | null;
}

/** A single step inside a workflow */
export type WorkflowStep = ToolStep | AskUserStep | ConfirmationStep;

interface BaseStep {
  /** Step name — used as key in collectedData */
  name: string;
}

/** Execute an API tool and store the result */
export interface ToolStep extends BaseStep {
  type: "tool";
  /** Name of the registered tool to call */
  tool: string;
  /** Build the tool input from collected context */
  input: (ctx: WorkflowContext) => Record<string, unknown>;
  /** Message to send on successful execution */
  onSuccess?: string;
  /** Message to send when the tool returns an empty result */
  onEmptyResult?: { message: string; fallback?: string };
  /** Message to send on error */
  onError?: string;
}

/** Send a message and wait for free-text or selection input */
export interface AskUserStep extends BaseStep {
  type: "ask_user";
  message: string | ((ctx: WorkflowContext) => string);
  /** If provided, renders as interactive options (buttons or list) */
  options?: (ctx: WorkflowContext) => Array<{ id: string; label: string }>;
}

/** Send a yes/no confirmation prompt and wait */
export interface ConfirmationStep extends BaseStep {
  type: "confirmation";
  message: string | ((ctx: WorkflowContext) => string);
  confirmLabel?: string;
  cancelLabel?: string;
}

/** A full workflow definition */
export interface WorkflowDefinition {
  /** Unique name used to identify and trigger the workflow */
  name: string;
  /** Natural language description used in the system prompt */
  trigger: string;
  steps: WorkflowStep[];
  /** Timeout behavior */
  timeout?: { minutes: number; message: string };
  /** How to handle off-topic messages mid-workflow */
  offTopic?: "pause_and_address" | "ignore" | "cancel";
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
export function defineWorkflow(config: WorkflowDefinition): WorkflowDefinition {
  return config;
}

/**
 * Helper to define a single workflow step with type inference.
 *
 * @example
 * ```typescript
 * step('confirm', { type: 'confirmation', message: ctx => `Book on ${ctx.collectedData.date}?` })
 * ```
 */
export function step(name: string, config: Omit<WorkflowStep, "name">): WorkflowStep {
  return { name, ...config } as WorkflowStep;
}
