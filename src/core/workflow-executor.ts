import type { ChannelAdapter } from "../channels/interface.js";
import { WorkflowError } from "../errors.js";
import { clearWorkflow } from "../session/manager.js";
import type { SessionStore } from "../session/stores/interface.js";
import type { Session } from "../session/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { InboundContent } from "../types/messages.js";
import type {
  WorkflowContext,
  WorkflowDefinition,
  WorkflowStep,
} from "../types/workflow.js";

const CONFIRM_BUTTON_ID = "confirm";
const CANCEL_MESSAGE = "Cancelled.";

/**
 * Start a named workflow for this session.
 *
 * Finds the workflow, initialises session workflow state, and executes the first step.
 * Throws WorkflowError if the workflow name is not found in the provided list.
 */
export async function startWorkflow(
  session: Session,
  workflowName: string,
  workflows: WorkflowDefinition[],
  toolRegistry: ToolRegistry,
  channelAdapter: ChannelAdapter,
  store: SessionStore,
): Promise<void> {
  const workflow = findWorkflow(workflowName, workflows);
  if (!workflow) {
    throw new WorkflowError(workflowName, "start", `workflow '${workflowName}' not found`);
  }

  const firstStep = workflow.steps[0];
  if (!firstStep) {
    throw new WorkflowError(workflowName, "start", "workflow has no steps");
  }

  session.workflow.name = workflowName;
  session.workflow.currentStep = firstStep.name;
  session.workflow.collectedData = {};
  session.workflow.pendingConfirmation = null;

  await executeStep(session, firstStep, workflow, toolRegistry, channelAdapter, store);
}

/**
 * Re-execute the current step of an active workflow.
 *
 * Used by the processor when a session has a non-pending active workflow and
 * needs to send the current prompt again (e.g. after re-routing).
 */
export async function continueWorkflow(
  session: Session,
  workflows: WorkflowDefinition[],
  toolRegistry: ToolRegistry,
  channelAdapter: ChannelAdapter,
  store: SessionStore,
): Promise<void> {
  const { name, currentStep } = session.workflow;
  if (!name || !currentStep) return;

  const workflow = findWorkflow(name, workflows);
  if (!workflow) return;

  const step = findStep(currentStep, workflow);
  if (!step) return;

  await executeStep(session, step, workflow, toolRegistry, channelAdapter, store);
}

/**
 * Process the user's reply to a waiting workflow step (ask_user or confirmation).
 *
 * Reads `session.workflow.pendingConfirmation` to determine which step to resume,
 * stores the user's response, and advances (or cancels) the workflow.
 */
export async function handleWorkflowResponse(
  session: Session,
  inboundContent: InboundContent,
  workflows: WorkflowDefinition[],
  toolRegistry: ToolRegistry,
  channelAdapter: ChannelAdapter,
  store: SessionStore,
): Promise<void> {
  const { name, pendingConfirmation } = session.workflow;
  if (!name || !pendingConfirmation) return;

  const workflow = findWorkflow(name, workflows);
  if (!workflow) return;

  const step = findStep(pendingConfirmation, workflow);
  if (!step) return;

  session.workflow.pendingConfirmation = null;

  if (step.type === "ask_user") {
    session.workflow.collectedData[step.name] = extractTextFromContent(inboundContent);
    await advanceToNextStep(session, step, workflow, toolRegistry, channelAdapter, store);
    return;
  }

  if (step.type === "confirmation") {
    if (!isConfirmResponse(inboundContent)) {
      clearWorkflow(session);
      await store.set(session.id, session);
      await channelAdapter.sendOutbound(session.channelUserId, { type: "text", text: CANCEL_MESSAGE });
      return;
    }
    session.workflow.collectedData[step.name] = true;
    await advanceToNextStep(session, step, workflow, toolRegistry, channelAdapter, store);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function executeStep(
  session: Session,
  step: WorkflowStep,
  workflow: WorkflowDefinition,
  toolRegistry: ToolRegistry,
  channelAdapter: ChannelAdapter,
  store: SessionStore,
): Promise<void> {
  const ctx = buildContext(session);

  if (step.type === "ask_user") {
    const text = typeof step.message === "function" ? step.message(ctx) : step.message;
    const options = step.options ? step.options(ctx) : undefined;

    session.workflow.pendingConfirmation = step.name;
    await store.set(session.id, session);

    if (options && options.length > 0) {
      await channelAdapter.sendOutbound(session.channelUserId, { type: "options", text, options });
    } else {
      await channelAdapter.sendOutbound(session.channelUserId, { type: "text", text });
    }
    return;
  }

  if (step.type === "confirmation") {
    const text = typeof step.message === "function" ? step.message(ctx) : step.message;

    session.workflow.pendingConfirmation = step.name;
    await store.set(session.id, session);

    await channelAdapter.sendOutbound(session.channelUserId, {
      type: "confirmation",
      text,
      ...(step.confirmLabel && { confirmLabel: step.confirmLabel }),
      ...(step.cancelLabel && { cancelLabel: step.cancelLabel }),
    });
    return;
  }

  if (step.type === "tool") {
    const toolDef = toolRegistry.get(step.tool);
    if (!toolDef) {
      throw new WorkflowError(
        workflow.name,
        step.name,
        `tool '${step.tool}' not found in registry`,
      );
    }

    let result: unknown;
    try {
      result = await toolDef.execute(step.input(ctx));
    } catch {
      const msg = step.onError ?? "Something went wrong. Please try again.";
      clearWorkflow(session);
      await store.set(session.id, session);
      await channelAdapter.sendOutbound(session.channelUserId, { type: "text", text: msg });
      return;
    }

    if (isEmptyResult(result)) {
      const msg = step.onEmptyResult?.message ?? "No results found.";
      clearWorkflow(session);
      await store.set(session.id, session);
      await channelAdapter.sendOutbound(session.channelUserId, { type: "text", text: msg });
      return;
    }

    session.workflow.collectedData[step.name] = result;

    if (step.onSuccess) {
      await channelAdapter.sendOutbound(session.channelUserId, { type: "text", text: step.onSuccess });
    }

    await advanceToNextStep(session, step, workflow, toolRegistry, channelAdapter, store);
  }
}

async function advanceToNextStep(
  session: Session,
  currentStep: WorkflowStep,
  workflow: WorkflowDefinition,
  toolRegistry: ToolRegistry,
  channelAdapter: ChannelAdapter,
  store: SessionStore,
): Promise<void> {
  const currentIndex = workflow.steps.findIndex((s) => s.name === currentStep.name);
  const nextStep = workflow.steps[currentIndex + 1];

  if (!nextStep) {
    clearWorkflow(session);
    await store.set(session.id, session);
    return;
  }

  session.workflow.currentStep = nextStep.name;
  await executeStep(session, nextStep, workflow, toolRegistry, channelAdapter, store);
}

function buildContext(session: Session): WorkflowContext {
  return {
    collectedData: session.workflow.collectedData,
    customer: session.customer,
  };
}

function extractTextFromContent(content: InboundContent): string {
  if (content.type === "text") return content.text;
  if (content.type === "button_reply") return content.text;
  if (content.type === "list_reply") return content.text;
  return "";
}

function isConfirmResponse(content: InboundContent): boolean {
  if (content.type === "button_reply") {
    return content.buttonId === CONFIRM_BUTTON_ID;
  }
  if (content.type === "text") {
    const text = content.text.toLowerCase().trim();
    return text === "yes" || text === "confirm" || text === "y";
  }
  return false;
}

function findWorkflow(name: string, workflows: WorkflowDefinition[]): WorkflowDefinition | undefined {
  return workflows.find((w) => w.name === name);
}

function findStep(stepName: string, workflow: WorkflowDefinition): WorkflowStep | undefined {
  return workflow.steps.find((s) => s.name === stepName);
}

function isEmptyResult(result: unknown): boolean {
  if (result === null || result === undefined) return true;
  if (typeof result === "string") return result.trim() === "";
  if (Array.isArray(result)) return result.length === 0;
  if (typeof result === "object") return Object.keys(result as object).length === 0;
  return false;
}
