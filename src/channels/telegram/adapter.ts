import type { Hono } from "hono";
import type { InboundMessage, OutboundMessage } from "../../types/messages.js";
import type { ChannelAdapter } from "../interface.js";
import { buildApiCall } from "./message-builders.js";
import type { TelegramCallbackQuery, TelegramMessage, TelegramUpdate, TelegramUser } from "./types.js";

export interface TelegramConfig {
  /**
   * Bot token obtained from @BotFather.
   * @example "123456789:AAFabc..."
   */
  token: string;
  /**
   * Secret token for webhook verification.
   * Pass this value to `setWebhook` as `secret_token`. Telegram will then include
   * `X-Telegram-Bot-Api-Secret-Token` on every update POST so you can verify it.
   * Strongly recommended for production use.
   */
  secretToken?: string;
  /**
   * Path Telegram will POST updates to.
   * Default: "/telegram/webhook"
   */
  webhookPath?: string;
}

/**
 * Create a Telegram Bot API channel adapter.
 *
 * @example
 * ```typescript
 * import { telegram } from 'konvo/channels/telegram'
 * const channel = telegram({ token: process.env.TELEGRAM_BOT_TOKEN! })
 * ```
 */
export function telegram(config: TelegramConfig): ChannelAdapter & { config: TelegramConfig } {
  return new TelegramAdapter(config);
}

export class TelegramAdapter implements ChannelAdapter {
  readonly config: TelegramConfig;
  private readonly apiBase: string;

  constructor(config: TelegramConfig) {
    this.config = config;
    this.apiBase = `https://api.telegram.org/bot${config.token}`;
  }

  /**
   * Parse a raw Telegram Update payload into a normalized InboundMessage.
   * Returns null for updates that are not actionable (missing data, unsupported type).
   */
  parseInbound(rawPayload: unknown): InboundMessage | null {
    const update = rawPayload as TelegramUpdate;

    if (update?.callback_query) {
      return this.parseCallbackQuery(update.callback_query);
    }

    if (update?.message) {
      return this.parseMessage(update.message);
    }

    return null;
  }

  /**
   * Send a normalized OutboundMessage to a Telegram chat.
   */
  async sendOutbound(to: string, message: OutboundMessage): Promise<void> {
    const { method, body } = buildApiCall(to, message);
    await this.callApi(method, body);
  }

  /**
   * Register the Telegram webhook route on the Hono app.
   * Called by createServer() when this adapter is configured.
   *
   * The path defaults to /telegram/webhook. Point your Telegram setWebhook call
   * to `https://your-domain.com/telegram/webhook`.
   */
  registerRoutes(app: Hono, handleUpdate: (rawBody: unknown) => Promise<void>): void {
    const path = this.config.webhookPath ?? "/telegram/webhook";
    const { secretToken } = this.config;

    app.post(path, async (c) => {
      // Verify the secret token if configured
      if (secretToken !== undefined) {
        const incoming = c.req.header("x-telegram-bot-api-secret-token");
        if (incoming !== secretToken) return c.text("Unauthorized", 401);
      }

      const body = (await c.req.json()) as TelegramUpdate;

      // Acknowledge callback queries immediately to dismiss the loading spinner
      // (Telegram expects answerCallbackQuery to be called within a few seconds)
      if (body.callback_query?.id) {
        void this.callApi("answerCallbackQuery", {
          callback_query_id: body.callback_query.id,
        }).catch(() => {
          // Non-fatal — spinner stays visible but processing continues
        });
      }

      // Fire-and-forget: respond 200 immediately, process async
      void handleUpdate(body).catch((err) => {
        console.error("[konvo] Error processing Telegram update:", err);
      });

      return c.text("OK", 200);
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private parseCallbackQuery(query: TelegramCallbackQuery): InboundMessage | null {
    const chatId = query.message?.chat.id;
    if (chatId === undefined || !query.data) return null;

    const date = query.message?.date ?? Math.floor(Date.now() / 1000);
    return {
      channelUserId: chatId.toString(),
      userName: formatName(query.from),
      messageId: `cbq_${query.id}`,
      timestamp: new Date(date * 1000),
      // buttonId is the option id; text mirrors it since Telegram callback_data
      // only returns the id, not the display label.
      content: { type: "button_reply", buttonId: query.data, text: query.data },
    };
  }

  private parseMessage(msg: TelegramMessage): InboundMessage | null {
    const chatId = msg.chat.id.toString();
    const userName = msg.from ? formatName(msg.from) : undefined;

    const base = {
      channelUserId: chatId,
      ...(userName !== undefined && { userName }),
      messageId: msg.message_id.toString(),
      timestamp: new Date(msg.date * 1000),
    };

    return { ...base, content: parseMessageContent(msg) };
  }

  async callApi(method: string, body: object): Promise<void> {
    const response = await fetch(`${this.apiBase}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Telegram API error ${response.status} on ${method}: ${text}`);
    }
  }
}

function formatName(user: TelegramUser): string {
  return user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name;
}

function parseMessageContent(msg: TelegramMessage): InboundMessage["content"] {
  if (msg.text) {
    return { type: "text", text: msg.text };
  }

  if (msg.photo && msg.photo.length > 0) {
    // Telegram sends multiple sizes; use the last (highest resolution)
    const photo = msg.photo[msg.photo.length - 1];
    if (!photo) return { type: "unsupported", raw: msg };
    if (msg.caption !== undefined) {
      return { type: "image", mediaId: photo.file_id, caption: msg.caption };
    }
    return { type: "image", mediaId: photo.file_id };
  }

  if (msg.location) {
    return { type: "location", lat: msg.location.latitude, lng: msg.location.longitude };
  }

  return { type: "unsupported", raw: msg };
}
