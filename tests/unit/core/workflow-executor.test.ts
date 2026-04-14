import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  continueWorkflow,
  handleWorkflowResponse,
  startWorkflow,
} from "../../../src/core/workflow-executor.js";
import { WorkflowError } from "../../../src/errors.js";
import { defineTool } from "../../../src/tools/define-tool.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { defineWorkflow, step } from "../../../src/types/workflow.js";
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

function freshMocks() {
  mockAdapter.sendOutbound.mockClear();
  mockStore.set.mockClear();
}

// --- Tools ---

const greetTool = defineTool({
  name: "greet",
  description: "Greet by name",
  parameters: z.object({ name: z.string() }),
  execute: async ({ name }) => `Hello, ${name}!`,
  actionLevel: "read",
});

const emptyTool = defineTool({
  name: "empty",
  description: "Returns null",
  parameters: z.object({}),
  execute: async () => null,
  actionLevel: "read",
});

const failingTool = defineTool({
  name: "failing",
  description: "Always throws",
  parameters: z.object({}),
  execute: async () => {
    throw new Error("boom");
  },
  actionLevel: "read",
});

function makeRegistry(...tools: ReturnType<typeof defineTool>[]) {
  const r = new ToolRegistry();
  for (const t of tools) r.add(t);
  return r;
}

// ---------------------------------------------------------------------------
// startWorkflow
// ---------------------------------------------------------------------------

describe("startWorkflow", () => {
  it("throws WorkflowError when workflow not found", async () => {
    const session = createTestSession();
    await expect(
      startWorkflow(session, "unknown", [], makeRegistry(), mockAdapter, mockStore),
    ).rejects.toThrow(WorkflowError);
  });

  it("throws WorkflowError when workflow has no steps", async () => {
    const session = createTestSession();
    const workflow = defineWorkflow({ name: "empty", trigger: "t", steps: [] });
    await expect(
      startWorkflow(session, "empty", [workflow], makeRegistry(), mockAdapter, mockStore),
    ).rejects.toThrow(WorkflowError);
  });

  it("sets workflow name and currentStep on the session", async () => {
    freshMocks();
    const session = createTestSession();
    const workflow = defineWorkflow({
      name: "greetFlow",
      trigger: "greet",
      steps: [step("ask", { type: "ask_user", message: "What is your name?" })],
    });
    await startWorkflow(session, "greetFlow", [workflow], makeRegistry(), mockAdapter, mockStore);
    expect(session.workflow.name).toBe("greetFlow");
    expect(session.workflow.currentStep).toBe("ask");
  });

  it("ask_user step: sends message and sets pendingConfirmation", async () => {
    freshMocks();
    const session = createTestSession();
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [step("ask", { type: "ask_user", message: "What is your name?" })],
    });
    await startWorkflow(session, "flow", [workflow], makeRegistry(), mockAdapter, mockStore);
    expect(session.workflow.pendingConfirmation).toBe("ask");
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ type: "text", text: "What is your name?" }),
    );
  });

  it("ask_user step with options: sends options message", async () => {
    freshMocks();
    const session = createTestSession();
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [
        step("pick", {
          type: "ask_user",
          message: "Choose",
          options: () => [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
        }),
      ],
    });
    await startWorkflow(session, "flow", [workflow], makeRegistry(), mockAdapter, mockStore);
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ type: "options", options: expect.arrayContaining([{ id: "a", label: "A" }]) }),
    );
  });

  it("confirmation step: sends confirmation and sets pendingConfirmation", async () => {
    freshMocks();
    const session = createTestSession();
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [step("confirm", { type: "confirmation", message: "Are you sure?" })],
    });
    await startWorkflow(session, "flow", [workflow], makeRegistry(), mockAdapter, mockStore);
    expect(session.workflow.pendingConfirmation).toBe("confirm");
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ type: "confirmation", text: "Are you sure?" }),
    );
  });

  it("tool step: executes tool, stores result, sends onSuccess, advances to next step", async () => {
    freshMocks();
    const session = createTestSession();
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [
        step("doGreet", {
          type: "tool",
          tool: "greet",
          input: () => ({ name: "World" }),
          onSuccess: "Done!",
        }),
        step("ask", { type: "ask_user", message: "Anything else?" }),
      ],
    });
    await startWorkflow(session, "flow", [workflow], makeRegistry(greetTool), mockAdapter, mockStore);
    expect(session.workflow.collectedData["doGreet"]).toBe("Hello, World!");
    expect(session.workflow.currentStep).toBe("ask");
    expect(session.workflow.pendingConfirmation).toBe("ask");
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ text: "Done!" }),
    );
  });

  it("tool step with empty result: sends onEmptyResult message and clears workflow", async () => {
    freshMocks();
    const session = createTestSession();
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [
        step("doEmpty", {
          type: "tool",
          tool: "empty",
          input: () => ({}),
          onEmptyResult: { message: "Nothing found." },
        }),
      ],
    });
    await startWorkflow(session, "flow", [workflow], makeRegistry(emptyTool), mockAdapter, mockStore);
    expect(session.workflow.name).toBeNull();
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ text: "Nothing found." }),
    );
  });

  it("tool step with error: sends onError message and clears workflow", async () => {
    freshMocks();
    const session = createTestSession();
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [
        step("doFail", {
          type: "tool",
          tool: "failing",
          input: () => ({}),
          onError: "Something went wrong.",
        }),
      ],
    });
    await startWorkflow(session, "flow", [workflow], makeRegistry(failingTool), mockAdapter, mockStore);
    expect(session.workflow.name).toBeNull();
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ text: "Something went wrong." }),
    );
  });

  it("saves the session to the store", async () => {
    freshMocks();
    const session = createTestSession();
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [step("ask", { type: "ask_user", message: "Hello?" })],
    });
    await startWorkflow(session, "flow", [workflow], makeRegistry(), mockAdapter, mockStore);
    expect(mockStore.set).toHaveBeenCalledWith(session.id, expect.objectContaining({ id: session.id }));
  });
});

// ---------------------------------------------------------------------------
// handleWorkflowResponse
// ---------------------------------------------------------------------------

describe("handleWorkflowResponse", () => {
  it("ask_user: stores text response in collectedData", async () => {
    freshMocks();
    const session = createTestSession({
      workflow: { name: "flow", currentStep: "ask", collectedData: {}, pendingConfirmation: "ask" },
    });
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [
        step("ask", { type: "ask_user", message: "Name?" }),
        step("confirm", { type: "confirmation", message: "Confirm?" }),
      ],
    });
    await handleWorkflowResponse(
      session,
      { type: "text", text: "Alice" },
      [workflow],
      makeRegistry(),
      mockAdapter,
      mockStore,
    );
    expect(session.workflow.collectedData["ask"]).toBe("Alice");
  });

  it("ask_user: stores button_reply text in collectedData", async () => {
    freshMocks();
    const session = createTestSession({
      workflow: { name: "flow", currentStep: "pick", collectedData: {}, pendingConfirmation: "pick" },
    });
    // Two-step workflow so collectedData isn't cleared by advanceToNextStep
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [
        step("pick", { type: "ask_user", message: "Choose" }),
        step("confirm", { type: "confirmation", message: "Confirm?" }),
      ],
    });
    await handleWorkflowResponse(
      session,
      { type: "list_reply", itemId: "item_1", text: "Option A" },
      [workflow],
      makeRegistry(),
      mockAdapter,
      mockStore,
    );
    expect(session.workflow.collectedData["pick"]).toBe("Option A");
  });

  it("ask_user: advances to the next step after response", async () => {
    freshMocks();
    const session = createTestSession({
      workflow: { name: "flow", currentStep: "ask", collectedData: {}, pendingConfirmation: "ask" },
    });
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [
        step("ask", { type: "ask_user", message: "Name?" }),
        step("confirm", {
          type: "confirmation",
          message: (ctx) => `Hello, ${ctx.collectedData["ask"]}. Confirm?`,
        }),
      ],
    });
    await handleWorkflowResponse(
      session,
      { type: "text", text: "Alice" },
      [workflow],
      makeRegistry(),
      mockAdapter,
      mockStore,
    );
    expect(session.workflow.pendingConfirmation).toBe("confirm");
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ type: "confirmation", text: "Hello, Alice. Confirm?" }),
    );
  });

  it("confirmation confirmed: stores true and advances", async () => {
    freshMocks();
    const session = createTestSession({
      workflow: {
        name: "flow",
        currentStep: "confirm",
        collectedData: {},
        pendingConfirmation: "confirm",
      },
    });
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [
        step("confirm", { type: "confirmation", message: "Sure?" }),
        step("ask2", { type: "ask_user", message: "What next?" }),
      ],
    });
    await handleWorkflowResponse(
      session,
      { type: "button_reply", buttonId: "confirm", text: "Yes" },
      [workflow],
      makeRegistry(),
      mockAdapter,
      mockStore,
    );
    expect(session.workflow.collectedData["confirm"]).toBe(true);
    expect(session.workflow.pendingConfirmation).toBe("ask2");
  });

  it("confirmation text 'yes': treated as confirmed", async () => {
    freshMocks();
    const session = createTestSession({
      workflow: {
        name: "flow",
        currentStep: "confirm",
        collectedData: {},
        pendingConfirmation: "confirm",
      },
    });
    // Two-step workflow so collectedData isn't cleared by advanceToNextStep
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [
        step("confirm", { type: "confirmation", message: "Sure?" }),
        step("ask2", { type: "ask_user", message: "What next?" }),
      ],
    });
    await handleWorkflowResponse(
      session,
      { type: "text", text: "yes" },
      [workflow],
      makeRegistry(),
      mockAdapter,
      mockStore,
    );
    expect(session.workflow.collectedData["confirm"]).toBe(true);
  });

  it("confirmation cancelled: clears workflow and sends cancel message", async () => {
    freshMocks();
    const session = createTestSession({
      workflow: {
        name: "flow",
        currentStep: "confirm",
        collectedData: {},
        pendingConfirmation: "confirm",
      },
    });
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [step("confirm", { type: "confirmation", message: "Sure?" })],
    });
    await handleWorkflowResponse(
      session,
      { type: "button_reply", buttonId: "cancel", text: "No" },
      [workflow],
      makeRegistry(),
      mockAdapter,
      mockStore,
    );
    expect(session.workflow.name).toBeNull();
    expect(session.workflow.currentStep).toBeNull();
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ type: "text" }),
    );
  });

  it("last step completed: clears workflow", async () => {
    freshMocks();
    const session = createTestSession({
      workflow: { name: "flow", currentStep: "ask", collectedData: {}, pendingConfirmation: "ask" },
    });
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [step("ask", { type: "ask_user", message: "Name?" })],
    });
    await handleWorkflowResponse(
      session,
      { type: "text", text: "Alice" },
      [workflow],
      makeRegistry(),
      mockAdapter,
      mockStore,
    );
    expect(session.workflow.name).toBeNull();
    expect(session.workflow.currentStep).toBeNull();
    expect(session.workflow.pendingConfirmation).toBeNull();
  });

  it("saves the session to the store", async () => {
    freshMocks();
    const session = createTestSession({
      workflow: { name: "flow", currentStep: "ask", collectedData: {}, pendingConfirmation: "ask" },
    });
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [
        step("ask", { type: "ask_user", message: "Name?" }),
        step("confirm", { type: "confirmation", message: "Confirm?" }),
      ],
    });
    await handleWorkflowResponse(
      session,
      { type: "text", text: "Alice" },
      [workflow],
      makeRegistry(),
      mockAdapter,
      mockStore,
    );
    expect(mockStore.set).toHaveBeenCalledWith(session.id, expect.objectContaining({ id: session.id }));
  });
});

// ---------------------------------------------------------------------------
// continueWorkflow
// ---------------------------------------------------------------------------

describe("continueWorkflow", () => {
  it("re-executes the current step from session state", async () => {
    freshMocks();
    const session = createTestSession({
      workflow: {
        name: "flow",
        currentStep: "ask",
        collectedData: {},
        pendingConfirmation: null,
      },
    });
    const workflow = defineWorkflow({
      name: "flow",
      trigger: "t",
      steps: [step("ask", { type: "ask_user", message: "Hello again?" })],
    });
    await continueWorkflow(session, [workflow], makeRegistry(), mockAdapter, mockStore);
    expect(session.workflow.pendingConfirmation).toBe("ask");
    expect(mockAdapter.sendOutbound).toHaveBeenCalledWith(
      session.channelUserId,
      expect.objectContaining({ text: "Hello again?" }),
    );
    expect(mockStore.set).toHaveBeenCalledWith(session.id, expect.objectContaining({ id: session.id }));
  });

  it("does nothing when there is no active workflow", async () => {
    freshMocks();
    const session = createTestSession();
    await continueWorkflow(session, [], makeRegistry(), mockAdapter, mockStore);
    expect(mockAdapter.sendOutbound).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Multi-step end-to-end flow
// ---------------------------------------------------------------------------

describe("multi-step flow (ask → tool → confirm → done)", () => {
  it("runs a full workflow from start to completion", async () => {
    freshMocks();
    const session = createTestSession();

    const workflow = defineWorkflow({
      name: "booking",
      trigger: "book",
      steps: [
        step("getName", { type: "ask_user", message: "What is your name?" }),
        step("doGreet", {
          type: "tool",
          tool: "greet",
          input: (ctx) => ({ name: ctx.collectedData["getName"] as string }),
          onSuccess: "Greeted successfully!",
        }),
        step("confirmDone", { type: "confirmation", message: "All done. Confirm?" }),
      ],
    });

    const registry = makeRegistry(greetTool);

    // Step 1: start workflow → ask_user
    await startWorkflow(session, "booking", [workflow], registry, mockAdapter, mockStore);
    expect(session.workflow.pendingConfirmation).toBe("getName");

    // Step 2: user responds to ask_user → tool executes → confirmation
    await handleWorkflowResponse(
      session,
      { type: "text", text: "Alice" },
      [workflow],
      registry,
      mockAdapter,
      mockStore,
    );
    expect(session.workflow.collectedData["getName"]).toBe("Alice");
    expect(session.workflow.collectedData["doGreet"]).toBe("Hello, Alice!");
    expect(session.workflow.pendingConfirmation).toBe("confirmDone");

    // Step 3: user confirms → workflow complete
    await handleWorkflowResponse(
      session,
      { type: "button_reply", buttonId: "confirm", text: "Yes" },
      [workflow],
      registry,
      mockAdapter,
      mockStore,
    );
    expect(session.workflow.name).toBeNull();
    expect(session.workflow.currentStep).toBeNull();
    expect(session.workflow.collectedData).toEqual({});
  });
});
