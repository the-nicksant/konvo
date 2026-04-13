import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../../src/core/prompts.js";

describe("buildSystemPrompt", () => {
  it("includes the developer instructions", () => {
    const prompt = buildSystemPrompt("You are a helpful clinic assistant.", new Date("2026-04-13"));
    expect(prompt).toContain("You are a helpful clinic assistant.");
  });

  it("prepends today's date in ISO format", () => {
    const prompt = buildSystemPrompt("Instructions.", new Date("2026-04-13"));
    expect(prompt).toContain("2026-04-13");
  });

  it("places the date before the instructions", () => {
    const prompt = buildSystemPrompt("Instructions.", new Date("2026-04-13"));
    const dateIndex = prompt.indexOf("2026-04-13");
    const instrIndex = prompt.indexOf("Instructions.");
    expect(dateIndex).toBeLessThan(instrIndex);
  });
});
