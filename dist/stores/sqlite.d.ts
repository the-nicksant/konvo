import { S as SessionStore, c as SessionId, b as Session } from '../interface-EgWcPq1c.js';
import 'ai';

interface SQLiteStoreConfig {
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
declare class SQLiteStore implements SessionStore {
    constructor(_config: SQLiteStoreConfig);
    get(_sessionId: SessionId): Promise<Session | null>;
    set(_sessionId: SessionId, _session: Session): Promise<void>;
    delete(_sessionId: SessionId): Promise<void>;
    cleanup(_olderThan: Date): Promise<number>;
}

export { SQLiteStore, type SQLiteStoreConfig };
