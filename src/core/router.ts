import { generateText, stepCountIs, tool } from "ai";
import type { LanguageModel } from "ai";
import type { ChannelAdapter } from "../channels/interface.js";
import type { SafetyConfig } from "../safety/middleware.js";
import { checkBeforeExecution } from "../safety/middleware.js";
import type { SessionStore } from "../session/stores/interface.js";
import type { Session } from "../session/types.js";
import type { ToolDefinition } from "../tools/types.js";
import { buildSystemPrompt } from "./prompts.js";

const DEFAULT_MAX_STEPS = 5;
const DEFAULT_HISTORY_WINDOW = 20;

/**
 * Route a new (non-workflow) message through the LLM with available tools.
 *
 * Appends the full conversation turn — user message plus all AI response messages
 * (tool calls, tool results, final text) — to session history, saves the session,
 * then sends the final text response via the channel adapter.
 *
 * @param session         Current user session
 * @param text            Inbound message text from the user
 * @param config          Model, instructions, and maxSteps from KonvoConfig.agent
 * @param availableTools  Tools filtered by the user's permissions
 * @param channelAdapter  Channel to send the response through
 * @param store           Session store for persistence
 * @param historyWindow   Max messages to keep (default 20)
 */
export async function routeNewMessage(
  session: Session,
  text: string,
  config: {
    model: LanguageModel;
    instructions: string;
    maxSteps?: number;
    /** Safety configuration applied to every tool call in this turn */
    safety?: SafetyConfig;
  },
  availableTools: ToolDefinition[],
  channelAdapter: ChannelAdapter,
  store: SessionStore,
  historyWindow = DEFAULT_HISTORY_WINDOW,
): Promise<void> {
  const systemPrompt = buildSystemPrompt(config.instructions);

  // Append user message so it's included when the LLM processes the history
  session.messages.push({ role: "user", content: text });

  const aiTools = buildAiTools(availableTools, session, config.safety);
  const hasTools = availableTools.length > 0;

  const result = await generateText({
    model: config.model,
    system: systemPrompt,
    messages: session.messages,
    ...(hasTools && { tools: aiTools }),
    stopWhen: stepCountIs(config.maxSteps ?? DEFAULT_MAX_STEPS),
  });

  // Aggregate messages from all steps (tool calls, tool results, final text)
  for (const stepResult of result.steps) {
    session.messages.push(...stepResult.response.messages);
  }
  session.messageCount++;
  session.lastMessageAt = new Date();

  trimHistory(session, historyWindow);
  await store.set(session.id, session);

  if (result.text) {
    await channelAdapter.sendOutbound(session.channelUserId, {
      type: "text",
      text: result.text,
    });
  }
}

function buildAiTools(toolDefs: ToolDefinition[], session: Session, safety?: SafetyConfig) {
  return Object.fromEntries(
    toolDefs.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: t.parameters,
        execute: (input) => {
          // Safety: rate limit + confirmation check before every tool execution.
          // confirmed=false here — the processor (Step 9) will set confirmed=true
          // for pre-approved tool calls based on session state.
          checkBeforeExecution(t, session.id, false, safety ?? {});
          return t.execute(input);
        },
      }),
    ]),
  );
}

function trimHistory(session: Session, historyWindow: number): void {
  if (session.messages.length > historyWindow) {
    const overflow = session.messages.length - historyWindow;
    // Remove oldest messages from the front in pairs to avoid orphaned roles.
    const pairsToRemove = Math.ceil(overflow / 2) * 2;
    session.messages.splice(0, pairsToRemove);
  }
}
