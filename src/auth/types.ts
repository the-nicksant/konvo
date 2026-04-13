/** A resolved user identity from the auth pipeline */
export interface UserIdentity {
  id: string
  name: string
  phone: string
  metadata: Record<string, unknown>
}

/** Result of the authenticate step */
export type AuthResult =
  | { status: 'authenticated' }
  | { status: 'denied'; reason: string }

/** What a user is allowed to do */
export interface UserPermissions {
  role: string
  /** Tool names the user may invoke. Use '*' to allow all. */
  allowedTools: string[] | '*'
  /** Workflow names the user may trigger. Use '*' to allow all. */
  allowedWorkflows: string[] | '*'
  metadata?: Record<string, unknown>
}

/** Behavior when a user fails authentication */
export interface UnauthenticatedHandler {
  /** Message sent to the user */
  message: string
  /** Optional guest permissions — if set, processing continues with limited access */
  fallbackPermissions?: UserPermissions
}

/** Full auth configuration */
export interface AuthConfig {
  /**
   * Resolve a phone number to a user identity.
   * Return null if the user is not found.
   */
  resolve?: (phoneNumber: string) => Promise<UserIdentity | null>

  /**
   * Decide if a user (or null guest) is allowed in.
   * Return `{ status: 'authenticated' }` to allow, `{ status: 'denied', reason }` to block.
   */
  authenticate?: (user: UserIdentity | null, phone: string) => Promise<AuthResult>

  /**
   * Denial handlers keyed by reason string, plus an optional 'default'.
   * If a handler has `fallbackPermissions`, the user proceeds as a guest.
   */
  onUnauthenticated?: Record<string, UnauthenticatedHandler> & {
    default?: UnauthenticatedHandler
  }

  /**
   * How long (seconds) to cache an auth result before re-running authenticate().
   * Default: 3600 (1 hour). Set to 0 to disable caching.
   */
  cacheFor?: number
}
