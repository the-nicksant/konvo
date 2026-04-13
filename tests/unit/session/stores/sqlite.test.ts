import { afterEach, describe, expect, it } from "vitest";
import { SQLiteStore } from "../../../../src/session/stores/sqlite.js";
import { createTestSession } from "../../../fixtures/sessions.js";
import { testSessionStoreContract } from "./store-contract.js";

let store: SQLiteStore;

describe("SQLiteStore", () => {
  afterEach(() => {
    store?.close();
  });

  testSessionStoreContract(() => {
    store = new SQLiteStore({ path: ":memory:" });
    return store;
  });

  describe("TTL expiry", () => {
    it("returns null for a session past its TTL", async () => {
      store = new SQLiteStore({ path: ":memory:", ttl: 1 }); // 1 second TTL
      const session = createTestSession({
        lastMessageAt: new Date(Date.now() - 2000), // 2 seconds ago
      });
      await store.set(session.id, session);

      // Reading back should trigger lazy TTL check and return null
      expect(await store.get(session.id)).toBeNull();
    });

    it("returns the session when it is within TTL", async () => {
      store = new SQLiteStore({ path: ":memory:", ttl: 3600 });
      const session = createTestSession({
        lastMessageAt: new Date(),
      });
      await store.set(session.id, session);
      expect(await store.get(session.id)).not.toBeNull();
    });
  });
});
