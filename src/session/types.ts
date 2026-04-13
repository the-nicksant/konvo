import type { ModelMessage } from "ai";
import type { UserIdentity, UserPermissions } from "../auth/types.js";

/** Branded session ID to avoid mixing with plain strings */
export type SessionId = string & { readonly __brand: "SessionId" };

/** Active workflow state stored in the session */
export interface WorkflowState {
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
export interface Session {
  /** "wa_5511999887766" */
  id: SessionId;
  /** Raw platform user ID (phone number for WhatsApp) */
  channelUserId: string;
  /** Resolved identity from auth.resolve(), or null */
  customer: UserIdentity | null;

  auth: {
    status: "authenticated" | "guest" | "pending" | null;
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
