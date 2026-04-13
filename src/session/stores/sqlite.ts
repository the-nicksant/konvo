import type { Session, SessionId } from "../types.js";
import type { SessionStore } from "./interface.js";

export interface SQLiteStoreConfig {
  /** File path for the SQLite database. Use ':memory:' for tests. */
  path: string;
  /** Session TTL in seconds. Default: 86400 (24 hours). */
  ttl?: number;
}

/**
 * Production session store backed by SQLite (better-sqlite3).
 * Zero infrastructure — persists to a single file across restarts.
 *
 * @example
 * ```typescript
 * import { SQLiteStore } from 'konvo/stores/sqlite'
 * const store = new SQLiteStore({ path: './sessions.db' })
 * ```
 */
export class SQLiteStore implements SessionStore {
  constructor(_config: SQLiteStoreConfig) {
    // Implementation in Step 2
    throw new Error("Not yet implemented");
  }

  async get(_sessionId: SessionId): Promise<Session | null> {
    throw new Error("Not yet implemented");
  }

  async set(_sessionId: SessionId, _session: Session): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async delete(_sessionId: SessionId): Promise<void> {
    throw new Error("Not yet implemented");
  }

  async cleanup(_olderThan: Date): Promise<number> {
    throw new Error("Not yet implemented");
  }
}
