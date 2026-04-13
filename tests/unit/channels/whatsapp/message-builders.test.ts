import { describe, expect, it } from "vitest";
import {
  buildConfirmationMessage,
  buildMessage,
  buildOptionsMessage,
  buildTextMessage,
} from "../../../../src/channels/whatsapp/message-builders.js";

describe("buildTextMessage", () => {
  it("returns a Text message with the given body", () => {
    const msg = buildTextMessage("Hello!");
    // whatsapp-api-js Text stores the body as JSON-serialisable shape
    expect(JSON.stringify(msg)).toContain("Hello!");
  });
});

describe("buildOptionsMessage", () => {
  it("uses buttons for ≤ 3 options", () => {
    const msg = buildOptionsMessage("Pick one:", [
      { id: "a", label: "Option A" },
      { id: "b", label: "Option B" },
    ]);
    const json = JSON.stringify(msg);
    expect(json).toContain("button");
    expect(json).toContain("Option A");
    expect(json).toContain("Option B");
  });

  it("uses a list for > 3 options", () => {
    const options = Array.from({ length: 4 }, (_, i) => ({ id: `opt${i}`, label: `Opt ${i}` }));
    const msg = buildOptionsMessage("Choose:", options);
    const json = JSON.stringify(msg);
    expect(json).toContain("list");
    expect(json).toContain("Opt 0");
    expect(json).toContain("Opt 3");
  });

  it("truncates button labels longer than 20 characters", () => {
    const msg = buildOptionsMessage("Pick:", [
      { id: "x", label: "A very long label that exceeds" },
    ]);
    const json = JSON.stringify(msg);
    // Label must be ≤ 20 chars; truncated with ellipsis
    const parsed = JSON.parse(json) as { action: { buttons: [{ reply: { title: string } }] } };
    const title = parsed.action.buttons[0]?.reply.title ?? "";
    expect(title.length).toBeLessThanOrEqual(20);
  });

  it("exactly 3 options still uses buttons", () => {
    const options = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ];
    const json = JSON.stringify(buildOptionsMessage("Pick:", options));
    expect(json).toContain("button");
  });
});

describe("buildConfirmationMessage", () => {
  it("uses default Yes/No labels", () => {
    const json = JSON.stringify(buildConfirmationMessage("Are you sure?"));
    expect(json).toContain("confirm");
    expect(json).toContain("Yes");
    expect(json).toContain("No");
  });

  it("uses custom labels when provided", () => {
    const json = JSON.stringify(buildConfirmationMessage("Delete?", "Delete", "Keep"));
    expect(json).toContain("Delete");
    expect(json).toContain("Keep");
  });
});

describe("buildMessage dispatch", () => {
  it("dispatches text type", () => {
    const json = JSON.stringify(buildMessage({ type: "text", text: "hi" }));
    expect(json).toContain("hi");
  });

  it("dispatches options type (buttons)", () => {
    const json = JSON.stringify(
      buildMessage({ type: "options", text: "Pick:", options: [{ id: "a", label: "A" }] }),
    );
    expect(json).toContain("button");
  });

  it("dispatches confirmation type", () => {
    const json = JSON.stringify(buildMessage({ type: "confirmation", text: "Sure?" }));
    expect(json).toContain("confirm");
  });

  it("dispatches image type as text fallback with url", () => {
    const json = JSON.stringify(
      buildMessage({ type: "image", url: "https://example.com/img.png" }),
    );
    expect(json).toContain("https://example.com/img.png");
  });
});
