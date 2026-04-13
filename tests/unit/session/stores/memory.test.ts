import { beforeAll, describe, vi } from "vitest";
import { MemoryStore } from "../../../../src/session/stores/memory.js";
import { testSessionStoreContract } from "./store-contract.js";

// Suppress the in-memory warning in tests
beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("MemoryStore", () => {
  testSessionStoreContract(() => new MemoryStore());
});
