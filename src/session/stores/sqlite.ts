import Database from "better-sqlite3";
import type { Session, SessionId } from "../types.js";
import type { SessionStore } from "./interface.js";

export interface SQLiteStoreConfig {
  /** File path for the SQLite database. Use ':memory:' for tests. */
  path: string;
  /** Session TTL in seconds. Default: 86400 (24 hours). */
  ttl?: number;
}

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    last_message_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_last_message ON sessions(last_message_at);
`;

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
  private readonly db: Database.Database;
  private readonly ttlMs: number;

  constructor(config: SQLiteStoreConfig) {
    this.db = new Database(config.path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(CREATE_TABLE);
    this.ttlMs = (config.ttl ?? 86400) * 1000;
  }

  async get(sessionId: SessionId): Promise<Session | null> {
    const row = this.db
      .prepare<[string], { data: string; last_message_at: string }>(
        "SELECT data, last_message_at FROM sessions WHERE id = ?",
      )
      .get(sessionId);

    if (!row) return null;

    // Check TTL — expired sessions are deleted lazily on read
    const lastMessage = new Date(row.last_message_at);
    if (Date.now() - lastMessage.getTime() > this.ttlMs) {
      this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
      return null;
    }

    return deserialize(row.data);
  }

  async set(sessionId: SessionId, session: Session): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions (id, data, last_message_at, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data = excluded.data,
           last_message_at = excluded.last_message_at`,
      )
      .run(
        sessionId,
        serialize(session),
        session.lastMessageAt.toISOString(),
        session.createdAt.toISOString(),
      );
  }

  async delete(sessionId: SessionId): Promise<void> {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  async cleanup(olderThan: Date): Promise<number> {
    const result = this.db
      .prepare("DELETE FROM sessions WHERE last_message_at < ?")
      .run(olderThan.toISOString());
    return result.changes;
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
  }
}

// JSON.stringify calls Date.toJSON() before the replacer, converting Dates to ISO strings.
// So we serialize naturally (Dates become strings) and restore the known Date fields on read.
function serialize(session: Session): string {
  return JSON.stringify(session);
}

const DATE_KEYS = new Set(["createdAt", "lastMessageAt"]);

function deserialize(data: string): Session {
  return JSON.parse(data, (key, value) => {
    if (DATE_KEYS.has(key) && typeof value === "string") return new Date(value);
    return value;
  }) as Session;
}
