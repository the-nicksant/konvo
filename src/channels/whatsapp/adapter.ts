import { WhatsAppAPI } from "whatsapp-api-js";
import type { InboundMessage, OutboundMessage } from "../../types/messages.js";
import type { ChannelAdapter } from "../interface.js";
import { buildMessage } from "./message-builders.js";
import type { WhatsAppWebhookPayload } from "./types.js";

export interface WhatsAppConfig {
  /** Phone Number ID from Meta Developer Portal */
  phoneNumberId: string;
  /** Permanent access token */
  accessToken: string;
  /** Verify token you set when registering the webhook URL */
  verifyToken: string;
  /** App Secret for HMAC signature verification */
  appSecret: string;
}

/**
 * Create a WhatsApp Cloud API channel adapter.
 *
 * @example
 * ```typescript
 * import { whatsapp } from 'konvo/channels/whatsapp'
 * const channel = whatsapp({ phoneNumberId, accessToken, verifyToken, appSecret })
 * ```
 */
export function whatsapp(config: WhatsAppConfig): ChannelAdapter & { config: WhatsAppConfig } {
  return new WhatsAppAdapter(config);
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly config: WhatsAppConfig;
  private readonly api: WhatsAppAPI;

  constructor(config: WhatsAppConfig) {
    this.config = config;
    // secure: false — HMAC signature verification is handled by our own Hono middleware
    // (src/server/middleware/verify-signature.ts), so we don't need whatsapp-api-js to do it
    this.api = new WhatsAppAPI({ token: config.accessToken, secure: false });
  }

  /**
   * Parse a raw Meta webhook payload into a normalized InboundMessage.
   * Returns null for status updates, delivery receipts, or unrecognized payloads.
   */
  parseInbound(rawPayload: unknown): InboundMessage | null {
    const payload = rawPayload as WhatsAppWebhookPayload;

    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    if (!value) return null;

    // Status updates (delivery receipts, read receipts) are not user messages
    if (!value.messages || value.messages.length === 0) return null;

    const msg = value.messages[0];
    if (!msg) return null;

    const contact = value.contacts?.[0];
    const channelUserId = msg.from;
    const userName = contact?.profile?.name;

    return {
      channelUserId,
      ...(userName !== undefined && { userName }),
      messageId: msg.id,
      timestamp: new Date(Number(msg.timestamp) * 1000),
      content: parseContent(msg),
    };
  }

  /**
   * Send a normalized OutboundMessage to a WhatsApp user.
   */
  async sendOutbound(to: string, message: OutboundMessage): Promise<void> {
    const waMessage = buildMessage(message);
    await this.api.sendMessage(this.config.phoneNumberId, to, waMessage);
  }
}

function parseContent(msg: {
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  image?: { id: string; caption?: string };
  location?: { latitude: number; longitude: number };
}): InboundMessage["content"] {
  switch (msg.type) {
    case "text":
      return { type: "text", text: msg.text?.body ?? "" };

    case "interactive": {
      const ia = msg.interactive;
      if (ia?.type === "button_reply" && ia.button_reply) {
        return { type: "button_reply", buttonId: ia.button_reply.id, text: ia.button_reply.title };
      }
      if (ia?.type === "list_reply" && ia.list_reply) {
        return { type: "list_reply", itemId: ia.list_reply.id, text: ia.list_reply.title };
      }
      return { type: "unsupported", raw: msg };
    }

    case "image":
      return {
        type: "image",
        mediaId: msg.image?.id ?? "",
        ...(msg.image?.caption !== undefined && { caption: msg.image.caption }),
      };

    case "location":
      return {
        type: "location",
        lat: msg.location?.latitude ?? 0,
        lng: msg.location?.longitude ?? 0,
      };

    default:
      return { type: "unsupported", raw: msg };
  }
}
