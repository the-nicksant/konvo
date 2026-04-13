// src/session/stores/sqlite.ts
var SQLiteStore = class {
  constructor(_config) {
    throw new Error("Not yet implemented");
  }
  async get(_sessionId) {
    throw new Error("Not yet implemented");
  }
  async set(_sessionId, _session) {
    throw new Error("Not yet implemented");
  }
  async delete(_sessionId) {
    throw new Error("Not yet implemented");
  }
  async cleanup(_olderThan) {
    throw new Error("Not yet implemented");
  }
};

export { SQLiteStore };
