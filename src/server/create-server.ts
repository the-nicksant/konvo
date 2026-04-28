import { Hono } from "hono";
import type { SessionStore } from "../session/stores/interface.js";
import type { KonvoConfig } from "../types/config.js";
import { processMessage, type ProcessorConfig } from "../core/processor.js";
import { verifySignature } from "./middleware/verify-signature.js";

/**
 * Create and return the Hono application that powers the framework's HTTP layer.
 *
 * Routes:
 * - GET  /webhook — Meta hub verification (subscribe request)
 * - POST /webhook — Inbound messages (verified via HMAC-SHA256)
 * - GET  /health  — Liveness probe
 *
 * Message processing is fire-and-forget: the handler responds 200 immediately
 * and processes the message asynchronously to meet Meta's 20-second deadline.
 *
 * @param config  Framework configuration. `config.webhook` must be set.
 * @param store   Session store instance (caller manages the lifecycle).
 */
export function createServer(config: KonvoConfig & { webhook: NonNullable<KonvoConfig["webhook"]> }, store: SessionStore): Hono {
  const app = new Hono();

  // GET /webhook — Meta sends this when registering the webhook URL
  app.get("/webhook", (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");

    if (mode === "subscribe" && token === config.webhook.verifyToken && challenge) {
      return c.text(challenge, 200);
    }

    return c.text("Forbidden", 403);
  });

  // POST /webhook — Inbound messages from WhatsApp
  app.post("/webhook", verifySignature(config.webhook.appSecret), async (c) => {
    const body = await c.req.json();
    const inbound = config.channel.parseInbound(body);

    if (!inbound) return c.text("OK", 200); // status update or non-message event

    const processorConfig: ProcessorConfig = {
      agent: config.agent,
      channel: config.channel,
      tools: config.tools,
      ...(config.workflows !== undefined && { workflows: config.workflows }),
      ...(config.auth !== undefined && { auth: config.auth }),
      ...(config.safety !== undefined && { safety: config.safety }),
      ...(config.historyWindow !== undefined && { historyWindow: config.historyWindow }),
      ...(config.onStepFinish !== undefined && { onStepFinish: config.onStepFinish }),
    };

    // Fire-and-forget: respond 200 immediately, process async
    void processMessage(inbound, processorConfig, store).catch((err) => {
      console.error("[konvo] Error processing message:", err);
    });

    return c.text("OK", 200);
  });

  // GET /health — liveness probe
  app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

  return app;
}
