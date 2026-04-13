import { beforeEach, describe, expect, it } from "vitest";
import type { SessionStore } from "../../../../src/session/stores/interface.js";
import type { Session, SessionId } from "../../../../src/session/types.js";
import { createTestSession } from "../../../fixtures/sessions.js";

/**
 * Shared contract test suite. Both MemoryStore and SQLiteStore must pass all of these.
 * Usage: call this function inside a describe() block in each store's test file.
 */
export function testSessionStoreContract(createStore: () => SessionStore) {
  let store: SessionStore;

  beforeEach(() => {
    store = createStore();
  });

  describe("get", () => {
    it("returns null for a non-existent session", async () => {
      expect(await store.get("wa_nonexistent" as SessionId)).toBeNull();
    });

    it("returns the session after it has been set", async () => {
      const session = createTestSession();
      await store.set(session.id, session);
      const retrieved = await store.get(session.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(session.id);
    });
  });

  describe("set / get round-trip", () => {
    it("preserves all scalar fields", async () => {
      const session = createTestSession({ channelUserId: "5511000000001", messageCount: 5 });
      await store.set(session.id, session);
      const retrieved = await store.get(session.id);
      expect(retrieved?.channelUserId).toBe("5511000000001");
      expect(retrieved?.messageCount).toBe(5);
    });

    it("preserves Date fields as Date objects", async () => {
      const now = new Date();
      const session = createTestSession({ createdAt: now, lastMessageAt: now });
      await store.set(session.id, session);
      const retrieved = await store.get(session.id);
      expect(retrieved?.createdAt).toBeInstanceOf(Date);
      expect(retrieved?.lastMessageAt).toBeInstanceOf(Date);
      expect(retrieved?.createdAt.toISOString()).toBe(now.toISOString());
    });

    it("preserves nested workflow state", async () => {
      const session = createTestSession({
        workflow: {
          name: "rescheduleAppointment",
          currentStep: "pickSlot",
          collectedData: { appointmentId: "apt_123" },
          pendingConfirmation: "confirm",
        },
      });
      await store.set(session.id, session);
      const retrieved = await store.get(session.id);
      expect(retrieved?.workflow.name).toBe("rescheduleAppointment");
      expect(retrieved?.workflow.collectedData).toEqual({ appointmentId: "apt_123" });
    });

    it("preserves message history", async () => {
      const session = createTestSession({
        messages: [
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi there" },
        ],
      });
      await store.set(session.id, session);
      const retrieved = await store.get(session.id);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[0]).toEqual({ role: "user", content: "hello" });
    });

    it("overwrites an existing session on set", async () => {
      const session = createTestSession({ messageCount: 1 });
      await store.set(session.id, session);
      const updated: Session = { ...session, messageCount: 5 };
      await store.set(session.id, updated);
      const retrieved = await store.get(session.id);
      expect(retrieved?.messageCount).toBe(5);
    });
  });

  describe("delete", () => {
    it("removes an existing session", async () => {
      const session = createTestSession();
      await store.set(session.id, session);
      await store.delete(session.id);
      expect(await store.get(session.id)).toBeNull();
    });

    it("is a no-op for a non-existent session", async () => {
      await expect(store.delete("wa_ghost" as SessionId)).resolves.toBeUndefined();
    });
  });

  describe("cleanup", () => {
    // Stores tested by this contract must implement cleanup().
    it("deletes sessions older than the cutoff date and returns the count", async () => {
      const old = createTestSession({
        id: "wa_old" as SessionId,
        lastMessageAt: new Date("2025-01-01T00:00:00.000Z"),
      });
      // Future date — will never be expired by TTL or cleanup during the test run
      const recent = createTestSession({
        id: "wa_recent" as SessionId,
        lastMessageAt: new Date("2099-01-01T00:00:00.000Z"),
      });
      await store.set(old.id, old);
      await store.set(recent.id, recent);

      const cutoff = new Date("2026-01-01T00:00:00.000Z");
      if (!store.cleanup) throw new Error("Store must implement cleanup()");
      const count = await store.cleanup(cutoff);
      expect(count).toBe(1);

      expect(await store.get(old.id)).toBeNull();
      expect(await store.get(recent.id)).not.toBeNull();
    });
  });
}
