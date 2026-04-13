import type { Session, SessionId } from '../types.js'

/** Pluggable persistence layer for sessions */
export interface SessionStore {
  get(sessionId: SessionId): Promise<Session | null>
  set(sessionId: SessionId, session: Session): Promise<void>
  delete(sessionId: SessionId): Promise<void>
  /** Remove sessions older than the given date. Returns count deleted. */
  cleanup?(olderThan: Date): Promise<number>
}
