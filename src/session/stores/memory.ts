import type { Session, SessionId } from "../types.js";
import type { SessionStore } from "./interface.js";

/**
 * In-memory session store. Zero configuration — useful for development and testing.
 *
 * ⚠️  Sessions are lost on process restart. Use SQLiteStore for production.
 */
export class MemoryStore implements SessionStore {
  private readonly sessions = new Map<SessionId, Session>();

  constructor() {
    console.warn(
      "⚠️  konvo: Using in-memory session store. Sessions will be lost on restart. " +
        "Use SQLiteStore for production.",
    );
  }

  async get(sessionId: SessionId): Promise<Session | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async set(sessionId: SessionId, session: Session): Promise<void> {
    this.sessions.set(sessionId, session);
  }

  async delete(sessionId: SessionId): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async cleanup(olderThan: Date): Promise<number> {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.lastMessageAt < olderThan) {
        this.sessions.delete(id);
        count++;
      }
    }
    return count;
  }
}
