import { describe, expect, it, vi } from "vitest";
import { Konvo } from "../../../src/core/agent.js";
import { ConfigValidationError } from "../../../src/errors.js";
import { createMockModel } from "../../fixtures/mock-model.js";

const validChannel = {
  parseInbound: vi.fn().mockReturnValue(null),
  sendOutbound: vi.fn().mockResolvedValue(undefined),
};

const validConfig = {
  agent: {
    model: createMockModel(["hi"]),
    instructions: "You are a helpful assistant.",
  },
  channel: validChannel,
  tools: [],
  webhook: {
    verifyToken: "test_token",
    appSecret: "test_secret",
  },
};

// ---------------------------------------------------------------------------
// Constructor — config validation
// ---------------------------------------------------------------------------

describe("Konvo constructor — config validation", () => {
  it("throws ConfigValidationError when agent is missing", () => {
    expect(
      () => new Konvo({ ...validConfig, agent: undefined as never }),
    ).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError when agent.model is missing", () => {
    expect(
      () =>
        new Konvo({
          ...validConfig,
          agent: { ...validConfig.agent, model: undefined as never },
        }),
    ).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError when agent.instructions is missing", () => {
    expect(
      () =>
        new Konvo({
          ...validConfig,
          agent: { ...validConfig.agent, instructions: "" },
        }),
    ).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError when channel is missing", () => {
    expect(
      () => new Konvo({ ...validConfig, channel: undefined as never }),
    ).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError when tools is not an array", () => {
    expect(
      () => new Konvo({ ...validConfig, tools: undefined as never }),
    ).toThrow(ConfigValidationError);
  });

  it("allows empty tools array", () => {
    expect(() => new Konvo({ ...validConfig, tools: [] })).not.toThrow();
  });

  it("throws ConfigValidationError when webhook.verifyToken is missing", () => {
    expect(
      () =>
        new Konvo({
          ...validConfig,
          webhook: { verifyToken: "", appSecret: "secret" },
        }),
    ).toThrow(ConfigValidationError);
  });

  it("throws ConfigValidationError when webhook.appSecret is missing", () => {
    expect(
      () =>
        new Konvo({
          ...validConfig,
          webhook: { verifyToken: "token", appSecret: "" },
        }),
    ).toThrow(ConfigValidationError);
  });

  it("accepts a valid config without webhook (serverless use case)", () => {
    const { webhook: _webhook, ...noWebhook } = validConfig;
    expect(() => new Konvo(noWebhook)).not.toThrow();
  });

  it("constructs successfully with all valid fields", () => {
    expect(() => new Konvo(validConfig)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// listen() — webhook config validation
// ---------------------------------------------------------------------------

describe("Konvo.listen() — validation", () => {
  it("throws ConfigValidationError when webhook config is absent", async () => {
    const { webhook: _webhook, ...noWebhook } = validConfig;
    const konvo = new Konvo(noWebhook);
    await expect(konvo.listen(0)).rejects.toThrow(ConfigValidationError);
  });
});

// ---------------------------------------------------------------------------
// listen() / stop() — lifecycle
// ---------------------------------------------------------------------------

describe("Konvo lifecycle", () => {
  it("starts an HTTP server and serves the health endpoint", async () => {
    const konvo = new Konvo(validConfig);
    // Use port 0 so the OS assigns an available port
    await konvo.listen(0);

    // Get the assigned port from the underlying server
    const address = (konvo as unknown as { server: { address(): { port: number } } }).server.address();
    const port = address.port;

    try {
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ status: "ok" });
    } finally {
      await konvo.stop();
    }
  });

  it("stop() is a no-op when server is not running", async () => {
    const konvo = new Konvo(validConfig);
    await expect(konvo.stop()).resolves.toBeUndefined();
  });
});
