import { ModelMessage } from 'ai';

/** A resolved user identity from the auth pipeline */
interface UserIdentity {
    id: string;
    name: string;
    phone: string;
    metadata: Record<string, unknown>;
}
/** Result of the authenticate step */
type AuthResult = {
    status: 'authenticated';
} | {
    status: 'denied';
    reason: string;
};
/** What a user is allowed to do */
interface UserPermissions {
    role: string;
    /** Tool names the user may invoke. Use '*' to allow all. */
    allowedTools: string[] | '*';
    /** Workflow names the user may trigger. Use '*' to allow all. */
    allowedWorkflows: string[] | '*';
    metadata?: Record<string, unknown>;
}
/** Behavior when a user fails authentication */
interface UnauthenticatedHandler {
    /** Message sent to the user */
    message: string;
    /** Optional guest permissions — if set, processing continues with limited access */
    fallbackPermissions?: UserPermissions;
}
/** Full auth configuration */
interface AuthConfig {
    /**
     * Resolve a phone number to a user identity.
     * Return null if the user is not found.
     */
    resolve?: (phoneNumber: string) => Promise<UserIdentity | null>;
    /**
     * Decide if a user (or null guest) is allowed in.
     * Return `{ status: 'authenticated' }` to allow, `{ status: 'denied', reason }` to block.
     */
    authenticate?: (user: UserIdentity | null, phone: string) => Promise<AuthResult>;
    /**
     * Denial handlers keyed by reason string, plus an optional 'default'.
     * If a handler has `fallbackPermissions`, the user proceeds as a guest.
     */
    onUnauthenticated?: Record<string, UnauthenticatedHandler> & {
        default?: UnauthenticatedHandler;
    };
    /**
     * How long (seconds) to cache an auth result before re-running authenticate().
     * Default: 3600 (1 hour). Set to 0 to disable caching.
     */
    cacheFor?: number;
}

/** Branded session ID to avoid mixing with plain strings */
type SessionId = string & {
    readonly __brand: 'SessionId';
};
/** Active workflow state stored in the session */
interface WorkflowState {
    /** Active workflow name, or null if none */
    name: string | null;
    /** Current step name within the workflow */
    currentStep: string | null;
    /** Data collected across workflow steps */
    collectedData: Record<string, unknown>;
    /** Step name waiting for user input, or null */
    pendingConfirmation: string | null;
}
/** Per-user conversation session */
interface Session {
    /** "wa_5511999887766" */
    id: SessionId;
    /** Raw platform user ID (phone number for WhatsApp) */
    channelUserId: string;
    /** Resolved identity from auth.resolve(), or null */
    customer: UserIdentity | null;
    auth: {
        status: 'authenticated' | 'guest' | 'pending' | null;
        /** Unix timestamp (ms) — re-run authenticate() after this */
        cachedUntil: number;
    };
    /** Permissions applied to this session */
    permissions: UserPermissions;
    /**
     * Conversation history in AI SDK ModelMessage format.
     * Bounded by a sliding window (default: 20 messages).
     */
    messages: ModelMessage[];
    workflow: WorkflowState;
    createdAt: Date;
    lastMessageAt: Date;
    messageCount: number;
}

/** Pluggable persistence layer for sessions */
interface SessionStore {
    get(sessionId: SessionId): Promise<Session | null>;
    set(sessionId: SessionId, session: Session): Promise<void>;
    delete(sessionId: SessionId): Promise<void>;
    /** Remove sessions older than the given date. Returns count deleted. */
    cleanup?(olderThan: Date): Promise<number>;
}

export type { AuthConfig as A, SessionStore as S, UserIdentity as U, WorkflowState as W, AuthResult as a, Session as b, SessionId as c, UserPermissions as d };
