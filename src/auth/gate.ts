import type { Session } from "../session/types.js";
import type { AuthConfig, UserIdentity, UserPermissions } from "./types.js";

const DEFAULT_CACHE_SECONDS = 3600;
const DEFAULT_PERMISSIONS: UserPermissions = {
  role: "default",
  allowedTools: "*",
  allowedWorkflows: "*",
};
const FALLBACK_DENY_MESSAGE = "You are not authorized to use this service.";

export type AuthGateResult =
  | {
      outcome: "allow";
      identity: UserIdentity | null;
      permissions: UserPermissions;
      /** Unix timestamp (ms) — store in session.auth.cachedUntil */
      cachedUntil: number;
    }
  | { outcome: "deny"; message: string };

/**
 * Run the identify → authenticate pipeline for an inbound message.
 *
 * Returns 'allow' with resolved identity and permissions, or 'deny' with
 * a message to send back to the user. Checks the session cache first —
 * re-authenticates only when the cache has expired.
 *
 * @param session    Current session (used for cache check)
 * @param phoneNumber  Raw channel user ID (WhatsApp phone number)
 * @param authConfig   Auth configuration from KonvoConfig
 * @param now        Current timestamp in ms (injectable for testing, defaults to Date.now())
 */
export async function runAuthGate(
  session: Session,
  phoneNumber: string,
  authConfig: AuthConfig,
  now = Date.now(),
): Promise<AuthGateResult> {
  const cacheForMs = (authConfig.cacheFor ?? DEFAULT_CACHE_SECONDS) * 1000;

  // No auth functions configured — open access
  if (!authConfig.resolve && !authConfig.authenticate) {
    return {
      outcome: "allow",
      identity: null,
      permissions: DEFAULT_PERMISSIONS,
      cachedUntil: now + cacheForMs,
    };
  }

  // Cache hit — trust the previously stored auth status
  if (session.auth.status !== null && now < session.auth.cachedUntil) {
    return {
      outcome: "allow",
      identity: session.customer,
      permissions: session.permissions,
      cachedUntil: session.auth.cachedUntil,
    };
  }

  // Resolve identity (optional step)
  const identity = authConfig.resolve ? await authConfig.resolve(phoneNumber) : null;

  // No authenticate function — treat resolved (or null) user as allowed
  if (!authConfig.authenticate) {
    return {
      outcome: "allow",
      identity,
      permissions: DEFAULT_PERMISSIONS,
      cachedUntil: now + cacheForMs,
    };
  }

  const authResult = await authConfig.authenticate(identity, phoneNumber);

  if (authResult.status === "authenticated") {
    return {
      outcome: "allow",
      identity,
      permissions: DEFAULT_PERMISSIONS,
      cachedUntil: now + cacheForMs,
    };
  }

  // Denied — look up the handler for this reason, falling back to 'default'
  const handlers = authConfig.onUnauthenticated;
  const handler = handlers?.[authResult.reason] ?? handlers?.default;

  if (handler?.fallbackPermissions) {
    return {
      outcome: "allow",
      identity: null,
      permissions: handler.fallbackPermissions,
      cachedUntil: now + cacheForMs,
    };
  }

  return { outcome: "deny", message: handler?.message ?? FALLBACK_DENY_MESSAGE };
}
