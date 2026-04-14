import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../../src/server/create-server.js";
import { createMockModel } from "../fixtures/mock-model.js";
import { textMessagePayload, buttonReplyPayload, statusUpdatePayload } from "../fixtures/webhook-payloads.js";

const APP_SECRET = "test_app_secret";
const VERIFY_TOKEN = "test_verify_token";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;
}

function makeApp(overrides?: { sendOutbound?: ReturnType<typeof vi.fn>; store?: ReturnType<typeof vi.fn> }) {
  const sendOutbound = overrides?.sendOutbound ?? vi.fn().mockResolvedValue(undefined);
  const store = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
  };

  const adapter = {
    parseInbound: vi.fn((raw) => {
      // Delegate to a simplified parser for testing
      const entry = (raw as typeof textMessagePayload).entry?.[0];
      const msg = entry?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return null;

      return {
        channelUserId: msg.from,
        messageId: msg.id,
        timestamp: new Date(Number(msg.timestamp) * 1000),
        content:
          msg.type === "text"
            ? { type: "text" as const, text: msg.text.body }
            : msg.type === "interactive" && msg.interactive.type === "button_reply"
              ? {
                  type: "button_reply" as const,
                  buttonId: msg.interactive.button_reply.id,
                  text: msg.interactive.button_reply.title,
                }
              : { type: "unsupported" as const, raw: msg },
      };
    }),
    sendOutbound,
  };

  const app = createServer(
    {
      channel: adapter,
      webhook: { verifyToken: VERIFY_TOKEN, appSecret: APP_SECRET },
      agent: {
        model: createMockModel(["Hello! How can I help you?"]),
        instructions: "You are a helpful assistant.",
      },
      tools: [],
    },
    store,
  );

  return { app, adapter, store: store, sendOutbound };
}

// ---------------------------------------------------------------------------
// GET /webhook — hub verification
// ---------------------------------------------------------------------------

describe("GET /webhook — hub verification", () => {
  it("returns the challenge when verify_token matches", async () => {
    const { app } = makeApp();
    const res = await app.request(
      `/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=challenge_abc`,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("challenge_abc");
  });

  it("returns 403 when verify_token does not match", async () => {
    const { app } = makeApp();
    const res = await app.request(
      "/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge_abc",
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 when hub.mode is not subscribe", async () => {
    const { app } = makeApp();
    const res = await app.request(
      `/webhook?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=abc`,
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /webhook — signature verification
// ---------------------------------------------------------------------------

describe("POST /webhook — signature verification", () => {
  it("returns 401 when signature header is missing", async () => {
    const { app } = makeApp();
    const body = JSON.stringify(textMessagePayload);
    const res = await app.request("/webhook", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when signature is invalid", async () => {
    const { app } = makeApp();
    const body = JSON.stringify(textMessagePayload);
    const res = await app.request("/webhook", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=badhash",
      },
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 when signature is valid", async () => {
    const { app } = makeApp();
    const body = JSON.stringify(textMessagePayload);
    const res = await app.request("/webhook", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
      },
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /webhook — message processing
// ---------------------------------------------------------------------------

describe("POST /webhook — message processing", () => {
  it("responds 200 and processes a text message end-to-end", async () => {
    let resolveProcessed!: () => void;
    const processed = new Promise<void>((resolve) => { resolveProcessed = resolve; });
    const sendOutbound = vi.fn().mockImplementation(() => {
      resolveProcessed();
      return Promise.resolve();
    });

    const { app, store } = makeApp({ sendOutbound });
    const body = JSON.stringify(textMessagePayload);

    const res = await app.request("/webhook", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
      },
    });

    expect(res.status).toBe(200);
    await processed;
    expect(sendOutbound).toHaveBeenCalledWith(
      "5511999887766",
      expect.objectContaining({ type: "text" }),
    );
    expect(store.set).toHaveBeenCalled();
  });

  it("returns 200 and skips processing for status update payloads", async () => {
    const { app, sendOutbound } = makeApp();
    const body = JSON.stringify(statusUpdatePayload);

    const res = await app.request("/webhook", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
      },
    });

    expect(res.status).toBe(200);
    // Give any potential async processing time to run
    await new Promise((r) => setTimeout(r, 10));
    expect(sendOutbound).not.toHaveBeenCalled();
  });

  it("processes a button_reply payload", async () => {
    let resolveProcessed!: () => void;
    const processed = new Promise<void>((resolve) => { resolveProcessed = resolve; });
    const sendOutbound = vi.fn().mockImplementation(() => {
      resolveProcessed();
      return Promise.resolve();
    });

    const { app } = makeApp({ sendOutbound });
    const body = JSON.stringify(buttonReplyPayload);

    const res = await app.request("/webhook", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body),
      },
    });

    expect(res.status).toBe(200);
    await processed;
    expect(sendOutbound).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns status ok", async () => {
    const { app } = makeApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok" });
  });
});
