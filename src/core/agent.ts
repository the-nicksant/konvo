import { createServer as createHttpServer, type Server } from "node:http";
import type { Hono } from "hono";
import { ConfigValidationError, KonvoError } from "../errors.js";
import { MemoryStore } from "../session/stores/memory.js";
import type { SessionStore } from "../session/stores/interface.js";
import { createServer } from "../server/create-server.js";
import type { KonvoConfig } from "../types/config.js";

/**
 * The main framework entry point. Wires together all tiers and starts the HTTP server.
 *
 * @example
 * ```typescript
 * const agent = new Konvo({
 *   agent: { model: openai('gpt-4o-mini'), instructions: 'You are a helpful assistant.' },
 *   channel: new WhatsAppAdapter({ ... }),
 *   tools: [myTool],
 *   webhook: { verifyToken: '...', appSecret: '...' },
 * })
 * await agent.listen(3000)
 * ```
 */
export class Konvo {
  private readonly config: KonvoConfig;
  private readonly store: SessionStore;
  private server: Server | null = null;

  constructor(config: KonvoConfig) {
    validateConfig(config);
    this.config = config;
    // Default to MemoryStore with a warning if no store is configured.
    // Users should switch to SQLiteStore for production.
    this.store = config.store ?? new MemoryStore();
  }

  /**
   * Start the HTTP webhook server on the given port.
   * Requires `config.webhook` to be set with `verifyToken` and `appSecret`.
   *
   * @param port TCP port to listen on
   */
  async listen(port: number): Promise<void> {
    if (this.server) {
      throw new KonvoError(
        "Server is already running. Call stop() before calling listen() again.",
        "SERVER_ALREADY_RUNNING",
      );
    }

    // Channels that implement registerRoutes (e.g. Telegram) manage their own
    // webhook setup and don't need the WhatsApp-specific webhook config.
    const channelProvidesRoutes =
      typeof (this.config.channel as { registerRoutes?: unknown }).registerRoutes === "function";

    if (!channelProvidesRoutes && !this.config.webhook) {
      throw new ConfigValidationError(
        "webhook",
        "required for listen() — provide verifyToken and appSecret from the Meta Developer Portal",
      );
    }

    const app = createServer(this.config, this.store);

    this.server = await serveHono(app, port);
    console.log(`[konvo] Listening on http://localhost:${port}`);
  }

  /**
   * Gracefully shut down the HTTP server.
   * Does nothing if the server is not running.
   */
  async stop(): Promise<void> {
    if (!this.server) return;

    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.server = null;
  }
}

// ---------------------------------------------------------------------------
// Node.js HTTP adapter for Hono
//
// Converts Node.js IncomingMessage ↔ Web API Request/Response so the
// Hono app (which uses the standard Fetch API) can run in Node.js
// without requiring @hono/node-server.
// ---------------------------------------------------------------------------

async function serveHono(app: Hono, port: number): Promise<Server> {
  const server = createHttpServer(async (nodeReq, nodeRes) => {
    const chunks: Buffer[] = [];
    for await (const chunk of nodeReq) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const host = nodeReq.headers.host ?? "localhost";
    const url = new URL(nodeReq.url ?? "/", `http://${host}`);
    const hasBody = nodeReq.method !== "GET" && nodeReq.method !== "HEAD";

    const webRequest = new Request(url, {
      method: nodeReq.method ?? "GET",
      headers: nodeReq.headers as Record<string, string>,
      ...(hasBody && chunks.length > 0 && { body: Buffer.concat(chunks) }),
    });

    let webResponse: Response;
    try {
      webResponse = await app.fetch(webRequest);
    } catch {
      nodeRes.writeHead(500);
      nodeRes.end();
      return;
    }

    nodeRes.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));

    if (webResponse.body) {
      const reader = webResponse.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        nodeRes.write(value);
      }
    }

    nodeRes.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, resolve);
  });
  return server;
}

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

function validateConfig(config: KonvoConfig): void {
  if (!config.agent) {
    throw new ConfigValidationError("agent", "required");
  }
  if (!config.agent.model) {
    throw new ConfigValidationError(
      "agent.model",
      'required — pass an AI SDK model, e.g. openai("gpt-4o-mini")',
    );
  }
  if (!config.agent.instructions) {
    throw new ConfigValidationError("agent.instructions", "required — provide a system prompt");
  }
  if (!config.channel) {
    throw new ConfigValidationError(
      "channel",
      "required — provide a channel adapter, e.g. new WhatsAppAdapter({ ... })",
    );
  }
  if (!Array.isArray(config.tools)) {
    throw new ConfigValidationError("tools", "must be an array — use [] if no tools are needed");
  }
  if (config.webhook !== undefined) {
    if (!config.webhook.verifyToken) {
      throw new ConfigValidationError(
        "webhook.verifyToken",
        "required — get this from Meta Developer Portal → WhatsApp → Configuration",
      );
    }
    if (!config.webhook.appSecret) {
      throw new ConfigValidationError(
        "webhook.appSecret",
        "required — get this from Meta Developer Portal → App Settings → Basic",
      );
    }
  }
}
