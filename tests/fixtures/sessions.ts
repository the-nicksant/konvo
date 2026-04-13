import type { Session, SessionId } from "../../src/session/types.js";

export function createTestSession(overrides?: Partial<Session>): Session {
  return {
    id: "wa_5511999887766" as SessionId,
    channelUserId: "5511999887766",
    customer: null,
    auth: { status: null, cachedUntil: 0 },
    permissions: { role: "default", allowedTools: "*", allowedWorkflows: "*" },
    messages: [],
    workflow: {
      name: null,
      currentStep: null,
      collectedData: {},
      pendingConfirmation: null,
    },
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    lastMessageAt: new Date(),
    messageCount: 0,
    ...overrides,
  };
}
