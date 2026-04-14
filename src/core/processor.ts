import { runAuthGate } from "../auth/gate.js";
import type { ChannelAdapter } from "../channels/interface.js";
import type { SafetyConfig } from "../safety/middleware.js";
import { getOrCreateSession } from "../session/manager.js";
import type { SessionStore } from "../session/stores/interface.js";
import { ToolRegistry } from "../tools/registry.js";
import type { ToolDefinition } from "../tools/types.js";
import type { AuthConfig } from "../auth/types.js";
import type { InboundContent, InboundMessage } from "../types/messages.js";
import type { WorkflowDefinition } from "../types/workflow.js";
import type { LanguageModel } from "ai";
import {
  continueWorkflow,
  handleWorkflowResponse,
  startWorkflow,
} from "./workflow-executor.js";
import { routeNewMessage } from "./router.js";

export interface ProcessorConfig {
  agent: {
    model: LanguageModel;
    instructions: string;
    maxSteps?: number;
  };
  /** Channel adapter for parsing inbound and sending outbound messages */
  channel: ChannelAdapter;
  tools: ToolDefinition[];
  workflows?: WorkflowDefinition[];
  auth?: AuthConfig;
  safety?: SafetyConfig;
  historyWindow?: number;
}

/**
 * Central message dispatcher. Called for every inbound message.
 *
 * Pipeline:
 * 1. Load or create the user's session
 * 2. Run the auth gate (identify → authenticate → authorize)
 * 3. Dispatch based on session state:
 *    - pendingConfirmation → handle workflow response
 *    - active workflow (no pending) → continue/re-send current step
 *    - no active workflow → route through LLM
 *
 * @param inbound   Normalized inbound message from the channel adapter
 * @param config    Framework configuration
 * @param store     Session persistence store
 */
export async function processMessage(
  inbound: InboundMessage,
  config: ProcessorConfig,
  store: SessionStore,
): Promise<void> {
  const session = await getOrCreateSession(inbound.channelUserId, store);

  // Auth gate — identify + authenticate + authorize
  const authResult = await runAuthGate(session, inbound.channelUserId, config.auth ?? {});

  if (authResult.outcome === "deny") {
    await config.channel.sendOutbound(inbound.channelUserId, {
      type: "text",
      text: authResult.message,
    });
    return;
  }

  // Apply auth result to session and persist immediately so the cache is durable
  // even if downstream processing throws before its own store.set call.
  session.customer = authResult.identity;
  session.permissions = authResult.permissions;
  session.auth = {
    status: authResult.identity !== null ? "authenticated" : "guest",
    cachedUntil: authResult.cachedUntil,
  };
  await store.set(session.id, session);

  // Build tool registry (full set — filtered by permissions for LLM routing below)
  const toolRegistry = new ToolRegistry();
  for (const t of config.tools) toolRegistry.add(t);

  const workflows = config.workflows ?? [];

  // Dispatch based on session state
  if (session.workflow.pendingConfirmation) {
    await handleWorkflowResponse(
      session,
      inbound.content,
      workflows,
      toolRegistry,
      config.channel,
      store,
    );
    return;
  }

  if (session.workflow.name) {
    // Re-execute the current step (recovery path — e.g. after a crashed send).
    // NOTE: Since processing is fire-and-forget, a second message arriving while a
    // tool step executes could trigger this branch concurrently. Step 10 (Konvo class)
    // must serialize per-session processing to prevent duplicate step execution.
    await continueWorkflow(session, workflows, toolRegistry, config.channel, store);
    return;
  }

  // No active workflow — route through LLM
  const text = extractText(inbound.content);
  if (!text) return; // Non-text content with no active workflow — nothing to route

  const availableTools = toolRegistry.filterByPermissions(session.permissions);

  await routeNewMessage(
    session,
    text,
    {
      model: config.agent.model,
      instructions: config.agent.instructions,
      ...(config.agent.maxSteps !== undefined && { maxSteps: config.agent.maxSteps }),
      ...(config.safety !== undefined && { safety: config.safety }),
    },
    availableTools,
    config.channel,
    store,
    config.historyWindow,
  );
}

function extractText(content: InboundContent): string {
  if (content.type === "text") return content.text;
  if (content.type === "button_reply") return content.text;
  if (content.type === "list_reply") return content.text;
  return "";
}
