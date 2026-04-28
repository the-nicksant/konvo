import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { routeNewMessage } from "../../../src/core/router.js";
import { defineTool } from "../../../src/tools/define-tool.js";
import { createMockModel, createMockModelWithToolCall } from "../../fixtures/mock-model.js";
import { createTestSession } from "../../fixtures/sessions.js";

const mockAdapter = {
  parseInbound: vi.fn(),
  sendOutbound: vi.fn().mockResolvedValue(undefined),
};

const mockStore = {
  get: vi.fn(),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn(),
};

const baseConfig = {
  model: createMockModel(["Hello from the bot."]),
  instructions: "You are a test assistant.",
};

describe("routeNewMessage — basic flow", () => {
  it("sends the LLM response to the channel adapter", async () => {
    const session = createTestSession();
    await routeNewMessage(session, "hi", baseConfig, [], mockAdapter, mockStore);
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ type: "text", text: "Hello from the bot." }),
    );
  });

  it("saves the session to the store after the LLM call", async () => {
    const session = createTestSession();
    await routeNewMessage(session, "hi", baseConfig, [], mockAdapter, mockStore);
    expect(mockStore.set).toHaveBeenCalledWith(
      session.id,
      expect.objectContaining({ id: session.id }),
    );
  });

  it("appends the user message to session history", async () => {
    const session = createTestSession();
    await routeNewMessage(session, "what's the time?", baseConfig, [], mockAdapter, mockStore);
    const userMsg = session.messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    if (userMsg && userMsg.role === "user") {
      expect(userMsg.content).toBe("what's the time?");
    }
  });

  it("appends the assistant response to session history", async () => {
    const session = createTestSession();
    await routeNewMessage(session, "hi", baseConfig, [], mockAdapter, mockStore);
    const assistantMsg = session.messages.find((m) => m.role === "assistant");
    expect(assistantMsg).toBeDefined();
  });

  it("increments messageCount", async () => {
    const session = createTestSession({ messageCount: 3 });
    await routeNewMessage(session, "hi", baseConfig, [], mockAdapter, mockStore);
    expect(session.messageCount).toBe(4);
  });

  it("does not send if LLM returns empty text", async () => {
    const config = { ...baseConfig, model: createMockModel([""]) };
    const session = createTestSession();
    const spy = vi.fn().mockResolvedValue(undefined);
    await routeNewMessage(
      session,
      "hi",
      config,
      [],
      { ...mockAdapter, sendOutbound: spy },
      mockStore,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("routeNewMessage — tool execution", () => {
  const echoTool = defineTool({
    name: "echo",
    description: "Echoes the input",
    parameters: z.object({ message: z.string() }),
    execute: async ({ message }) => `echoed: ${message}`,
    actionLevel: "read",
  });

  it("executes a tool and sends the final text response", async () => {
    const model = createMockModelWithToolCall("echo", { message: "hello" }, "Tool done.");
    const session = createTestSession();
    await routeNewMessage(
      session,
      "echo hello",
      { ...baseConfig, model },
      [echoTool],
      mockAdapter,
      mockStore,
    );
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ text: "Tool done." }),
    );
  });

  it("includes tool call and result messages in session history", async () => {
    const model = createMockModelWithToolCall("echo", { message: "test" }, "Done.");
    const session = createTestSession();
    await routeNewMessage(
      session,
      "run echo",
      { ...baseConfig, model },
      [echoTool],
      mockAdapter,
      mockStore,
    );
    // Should have: user + (assistant tool-call) + (tool result) + (assistant text) = 4+ messages
    expect(session.messages.length).toBeGreaterThanOrEqual(3);
  });
});

describe("routeNewMessage — onStepFinish hook", () => {
  const echoTool = defineTool({
    name: "echo",
    description: "Echoes the input",
    parameters: z.object({ message: z.string() }),
    execute: async ({ message }) => `echoed: ${message}`,
    actionLevel: "read",
  });

  it("calls onStepFinish with toolCalls data when a tool is invoked", async () => {
    const model = createMockModelWithToolCall("echo", { message: "hello" }, "Done.");
    const session = createTestSession();
    const onStepFinish = vi.fn().mockResolvedValue(undefined);

    await routeNewMessage(
      session,
      "echo hello",
      { ...baseConfig, model, onStepFinish },
      [echoTool],
      mockAdapter,
      mockStore,
    );

    expect(onStepFinish).toHaveBeenCalled();
    const callArg = onStepFinish.mock.calls[0][0];
    expect(callArg).toHaveProperty("toolCalls");
    expect(callArg.toolCalls).toEqual(
      expect.arrayContaining([expect.objectContaining({ toolName: "echo" })]),
    );
  });

  it("does not throw when onStepFinish is not provided", async () => {
    const model = createMockModelWithToolCall("echo", { message: "hello" }, "Done.");
    const session = createTestSession();

    await expect(
      routeNewMessage(session, "echo hello", { ...baseConfig, model }, [echoTool], mockAdapter, mockStore),
    ).resolves.toBeUndefined();
  });
});

describe("routeNewMessage — history trimming", () => {
  it("trims history when it exceeds the window", async () => {
    const session = createTestSession({
      // Pre-fill with 19 messages: 19 + user + assistant = 21, which exceeds the window of 20
      messages: Array.from({ length: 19 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `msg ${i}`,
      })),
    });
    await routeNewMessage(session, "new message", baseConfig, [], mockAdapter, mockStore, 20);
    expect(session.messages.length).toBeLessThanOrEqual(20);
    // Oldest messages were removed — the first message should not be the original msg 0
    expect(session.messages[0]).not.toEqual({ role: "user", content: "msg 0" });
  });
});
