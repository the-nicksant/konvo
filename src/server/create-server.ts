import { Hono } from "hono";
import { ConfigValidationError } from "../errors.js";
import type { SessionStore } from "../session/stores/interface.js";
import type { KonvoConfig } from "../types/config.js";
import type { ChannelAdapter } from "../channels/interface.js";
import { processMessage, type ProcessorConfig } from "../core/processor.js";
import { verifySignature } from "./middleware/verify-signature.js";

/**
 * Create and return the Hono application that powers the framework's HTTP layer.
 *
 * If the channel adapter implements `registerRoutes`, it controls route setup
 * (used by Telegram and other non-WhatsApp channels). Otherwise, the default
 * WhatsApp routes are registered and `config.webhook` must be provided.
 *
 * Default routes (WhatsApp):
 * - GET  /webhook — Meta hub verification (subscribe request)
 * - POST /webhook — Inbound messages (verified via HMAC-SHA256)
 *
 * Always present:
 * - GET  /health  — Liveness probe
 *
 * @param config  Framework configuration.
 * @param store   Session store instance (caller manages the lifecycle).
 */
export function createServer(config: KonvoConfig, store: SessionStore): Hono {
  const app = new Hono();

  // GET /health — always present
  app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

  const processorConfig: ProcessorConfig = {
    agent: config.agent,
    channel: config.channel,
    tools: config.tools,
    ...(config.workflows !== undefined && { workflows: config.workflows }),
    ...(config.auth !== undefined && { auth: config.auth }),
    ...(config.safety !== undefined && { safety: config.safety }),
    ...(config.historyWindow !== undefined && { historyWindow: config.historyWindow }),
  };

  // Shared update handler — parses the raw payload and runs the full pipeline
  const handleUpdate: WebhookHandler = async (rawBody) => {
    const inbound = config.channel.parseInbound(rawBody);
    if (!inbound) return;
    await processMessage(inbound, processorConfig, store);
  };

  // Let the channel adapter register its own routes if it provides them
  if (hasRegisterRoutes(config.channel)) {
    config.channel.registerRoutes(app, handleUpdate);
    return app;
  }

  // Fallback: WhatsApp-specific routes (requires config.webhook)
  const { webhook } = config;
  if (!webhook) {
    throw new ConfigValidationError(
      "webhook",
      "required for this channel adapter — provide verifyToken and appSecret from the Meta Developer Portal",
    );
  }

  // GET /webhook — Meta sends this when registering the webhook URL
  app.get("/webhook", (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");

    if (mode === "subscribe" && token === webhook.verifyToken && challenge) {
      return c.text(challenge, 200);
    }
    return c.text("Forbidden", 403);
  });

  // POST /webhook — Inbound messages from WhatsApp
  app.post("/webhook", verifySignature(webhook.appSecret), async (c) => {
    const body = await c.req.json();

    // Fire-and-forget: respond 200 immediately, process async
    void handleUpdate(body).catch((err) => {
      console.error("[konvo] Error processing message:", err);
    });

    return c.text("OK", 200);
  });

  return app;
}

// ---------------------------------------------------------------------------
// Internal types for duck-typing channel route registration
// ---------------------------------------------------------------------------

type WebhookHandler = (rawBody: unknown) => Promise<void>;

type ChannelWithRoutes = ChannelAdapter & {
  registerRoutes(app: Hono, handleUpdate: WebhookHandler): void;
};

function hasRegisterRoutes(channel: ChannelAdapter): channel is ChannelWithRoutes {
  return typeof (channel as ChannelWithRoutes).registerRoutes === "function";
}
