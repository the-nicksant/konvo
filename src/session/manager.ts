import type { SessionStore } from "./stores/interface.js";
import type { Session, SessionId, WorkflowState } from "./types.js";

const DEFAULT_HISTORY_WINDOW = 20;

const DEFAULT_PERMISSIONS = {
  role: "default",
  allowedTools: "*" as const,
  allowedWorkflows: "*" as const,
};

const DEFAULT_WORKFLOW_STATE: WorkflowState = {
  name: null,
  currentStep: null,
  collectedData: {},
  pendingConfirmation: null,
};

function makeSessionId(channelUserId: string): SessionId {
  return `wa_${channelUserId}` as SessionId;
}

/**
 * Load an existing session or create a fresh one for the given user.
 * The new session has null auth, default permissions, and empty history.
 */
export async function getOrCreateSession(
  channelUserId: string,
  store: SessionStore,
): Promise<Session> {
  const id = makeSessionId(channelUserId);
  const existing = await store.get(id);
  if (existing) return existing;

  const now = new Date();
  const session: Session = {
    id,
    channelUserId,
    customer: null,
    auth: { status: null, cachedUntil: 0 },
    permissions: DEFAULT_PERMISSIONS,
    messages: [],
    workflow: { ...DEFAULT_WORKFLOW_STATE, collectedData: {} },
    createdAt: now,
    lastMessageAt: now,
    messageCount: 0,
  };

  await store.set(id, session);
  return session;
}

/**
 * Append a message pair (user + assistant) to session history and enforce the sliding window.
 * Always keeps the first message to preserve the original intent.
 * Mutates the session in place — caller must persist with store.set().
 */
export function appendMessages(
  session: Session,
  userText: string,
  assistantText: string,
  historyWindow = DEFAULT_HISTORY_WINDOW,
): void {
  session.messages.push({ role: "user", content: userText });
  session.messages.push({ role: "assistant", content: assistantText });
  session.messageCount++;
  session.lastMessageAt = new Date();

  // Sliding window: trim in pairs from index 1 to preserve user/assistant alternation.
  // Always keeps index 0 (the original intent message).
  if (session.messages.length > historyWindow) {
    const overflow = session.messages.length - historyWindow;
    const pairsToRemove = Math.ceil(overflow / 2) * 2;
    session.messages.splice(1, pairsToRemove);
  }
}

/** Reset all workflow state on the session. Call after a workflow completes or is cancelled. */
export function clearWorkflow(session: Session): void {
  session.workflow = { ...DEFAULT_WORKFLOW_STATE, collectedData: {} };
}
