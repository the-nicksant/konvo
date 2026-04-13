import { beforeAll, describe, expect, it, vi } from "vitest";
import { appendMessages, clearWorkflow, getOrCreateSession } from "../../../src/session/manager.js";
import { MemoryStore } from "../../../src/session/stores/memory.js";
import { createTestSession } from "../../fixtures/sessions.js";

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getOrCreateSession", () => {
  it("creates a new session when none exists", async () => {
    const store = new MemoryStore();
    const session = await getOrCreateSession("5511999887766", store);
    expect(session.id).toBe("wa_5511999887766");
    expect(session.channelUserId).toBe("5511999887766");
    expect(session.messages).toHaveLength(0);
    expect(session.customer).toBeNull();
  });

  it("returns the same session on subsequent calls", async () => {
    const store = new MemoryStore();
    const first = await getOrCreateSession("5511999887766", store);
    first.messageCount = 3;
    await store.set(first.id, first);

    const second = await getOrCreateSession("5511999887766", store);
    expect(second.messageCount).toBe(3);
  });

  it("persists the new session to the store", async () => {
    const store = new MemoryStore();
    const session = await getOrCreateSession("5511000000001", store);
    const stored = await store.get(session.id);
    expect(stored).not.toBeNull();
    expect(stored?.id).toBe(session.id);
  });
});

describe("appendMessages", () => {
  it("adds a user and assistant message pair", () => {
    const session = createTestSession({ messages: [] });
    appendMessages(session, "hello", "hi there");
    expect(session.messages).toHaveLength(2);
    expect(session.messages[0]).toEqual({ role: "user", content: "hello" });
    expect(session.messages[1]).toEqual({ role: "assistant", content: "hi there" });
  });

  it("increments messageCount and updates lastMessageAt", () => {
    const session = createTestSession({ messageCount: 0 });
    const before = session.lastMessageAt;
    appendMessages(session, "a", "b");
    expect(session.messageCount).toBe(1);
    expect(session.lastMessageAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("trims history to the window size, keeping the first message", () => {
    const session = createTestSession({ messages: [] });
    // Fill with 10 pairs = 20 messages (at the window limit of 20)
    for (let i = 0; i < 10; i++) {
      appendMessages(session, `user ${i}`, `bot ${i}`);
    }
    expect(session.messages).toHaveLength(20);

    // One more pair should push it over and trigger trimming
    appendMessages(session, "user 10", "bot 10", 20);
    expect(session.messages).toHaveLength(20);
    // First message (index 0) must always be preserved
    expect(session.messages[0]).toEqual({ role: "user", content: "user 0" });
    // Last messages are the newest
    expect(session.messages[session.messages.length - 1]).toEqual({
      role: "assistant",
      content: "bot 10",
    });
  });

  it("respects a custom window size", () => {
    const session = createTestSession({ messages: [] });
    for (let i = 0; i < 5; i++) {
      appendMessages(session, `u${i}`, `a${i}`, 4);
    }
    expect(session.messages).toHaveLength(4);
  });
});

describe("clearWorkflow", () => {
  it("resets all workflow fields to null/empty", () => {
    const session = createTestSession({
      workflow: {
        name: "booking",
        currentStep: "pickDate",
        collectedData: { date: "2026-05-01" },
        pendingConfirmation: "confirm",
      },
    });
    clearWorkflow(session);
    expect(session.workflow.name).toBeNull();
    expect(session.workflow.currentStep).toBeNull();
    expect(session.workflow.collectedData).toEqual({});
    expect(session.workflow.pendingConfirmation).toBeNull();
  });
});
