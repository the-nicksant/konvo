import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "../../../src/tools/define-tool.js";

describe("defineTool", () => {
  it("returns a tool with the correct name and description", () => {
    const tool = defineTool({
      name: "myTool",
      description: "Use when testing.",
      parameters: z.object({ input: z.string() }),
      execute: async ({ input }) => input,
    });
    expect(tool.name).toBe("myTool");
    expect(tool.description).toBe("Use when testing.");
  });

  it("defaults actionLevel to 'read'", () => {
    const tool = defineTool({
      name: "readTool",
      description: "Read something.",
      parameters: z.object({}),
      execute: async () => null,
    });
    expect(tool.actionLevel).toBe("read");
  });

  it("uses the provided actionLevel", () => {
    const tool = defineTool({
      name: "deleteTool",
      description: "Delete something.",
      parameters: z.object({ id: z.string() }),
      execute: async () => null,
      actionLevel: "destructive",
    });
    expect(tool.actionLevel).toBe("destructive");
  });

  it("includes formatResponse when provided", () => {
    const fmt = (r: unknown) => String(r);
    const tool = defineTool({
      name: "fmtTool",
      description: "Format tool.",
      parameters: z.object({}),
      execute: async () => "result",
      formatResponse: fmt,
    });
    expect(tool.formatResponse).toBe(fmt);
  });

  it("omits formatResponse when not provided", () => {
    const tool = defineTool({
      name: "noFmtTool",
      description: "No format tool.",
      parameters: z.object({}),
      execute: async () => null,
    });
    expect("formatResponse" in tool).toBe(false);
  });

  it("execute calls through to the provided function", async () => {
    const tool = defineTool({
      name: "execTool",
      description: "Exec tool.",
      parameters: z.object({ x: z.number() }),
      execute: async ({ x }) => x * 2,
    });
    expect(await tool.execute({ x: 5 })).toBe(10);
  });
});
