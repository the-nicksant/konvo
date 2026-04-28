import { describe, expect, it } from "vitest";
import {
  buildApiCall,
  buildConfirmationCall,
  buildImageCall,
  buildOptionsCall,
  buildTextCall,
} from "../../../../src/channels/telegram/message-builders.js";

describe("buildTextCall", () => {
  it("produces a sendMessage call with the given text", () => {
    const call = buildTextCall("123", "Hello!");
    expect(call.method).toBe("sendMessage");
    if (call.method === "sendMessage") {
      expect(call.body.chat_id).toBe("123");
      expect(call.body.text).toBe("Hello!");
      expect(call.body.reply_markup).toBeUndefined();
    }
  });
});

describe("buildOptionsCall", () => {
  it("produces a sendMessage call with an inline keyboard", () => {
    const call = buildOptionsCall("123", "Pick one:", [
      { id: "a", label: "Option A" },
      { id: "b", label: "Option B" },
    ]);
    expect(call.method).toBe("sendMessage");
    if (call.method === "sendMessage") {
      expect(call.body.text).toBe("Pick one:");
      const kb = call.body.reply_markup?.inline_keyboard;
      expect(kb).toHaveLength(2);
      expect(kb?.[0]).toEqual([{ text: "Option A", callback_data: "a" }]);
      expect(kb?.[1]).toEqual([{ text: "Option B", callback_data: "b" }]);
    }
  });

  it("places each option on its own row", () => {
    const options = Array.from({ length: 5 }, (_, i) => ({ id: `o${i}`, label: `Opt ${i}` }));
    const call = buildOptionsCall("123", "Choose:", options);
    if (call.method === "sendMessage") {
      expect(call.body.reply_markup?.inline_keyboard).toHaveLength(5);
    }
  });
});

describe("buildConfirmationCall", () => {
  it("uses Yes/No defaults with confirm/cancel callback data", () => {
    const call = buildConfirmationCall("123", "Are you sure?");
    expect(call.method).toBe("sendMessage");
    if (call.method === "sendMessage") {
      const row = call.body.reply_markup?.inline_keyboard[0];
      expect(row).toEqual([
        { text: "Yes", callback_data: "confirm" },
        { text: "No", callback_data: "cancel" },
      ]);
    }
  });

  it("uses custom labels", () => {
    const call = buildConfirmationCall("123", "Delete?", "Delete it", "Keep it");
    if (call.method === "sendMessage") {
      const row = call.body.reply_markup?.inline_keyboard[0];
      expect(row?.[0]?.text).toBe("Delete it");
      expect(row?.[1]?.text).toBe("Keep it");
    }
  });

  it("places both buttons on a single row", () => {
    const call = buildConfirmationCall("123", "Confirm?");
    if (call.method === "sendMessage") {
      expect(call.body.reply_markup?.inline_keyboard).toHaveLength(1);
      expect(call.body.reply_markup?.inline_keyboard[0]).toHaveLength(2);
    }
  });
});

describe("buildImageCall", () => {
  it("produces a sendPhoto call with the url as photo", () => {
    const call = buildImageCall("123", "https://example.com/img.png");
    expect(call.method).toBe("sendPhoto");
    if (call.method === "sendPhoto") {
      expect(call.body.photo).toBe("https://example.com/img.png");
      expect(call.body).not.toHaveProperty("caption");
    }
  });

  it("includes caption when provided", () => {
    const call = buildImageCall("123", "https://example.com/img.png", "A photo");
    if (call.method === "sendPhoto") {
      expect(call.body.caption).toBe("A photo");
    }
  });
});

describe("buildApiCall dispatch", () => {
  it("dispatches text", () => {
    const call = buildApiCall("1", { type: "text", text: "hi" });
    expect(call.method).toBe("sendMessage");
  });

  it("dispatches options", () => {
    const call = buildApiCall("1", {
      type: "options",
      text: "Pick:",
      options: [{ id: "a", label: "A" }],
    });
    expect(call.method).toBe("sendMessage");
    if (call.method === "sendMessage") {
      expect(call.body.reply_markup).toBeDefined();
    }
  });

  it("dispatches confirmation", () => {
    const call = buildApiCall("1", { type: "confirmation", text: "Sure?" });
    expect(call.method).toBe("sendMessage");
    if (call.method === "sendMessage") {
      const row = call.body.reply_markup?.inline_keyboard[0];
      expect(row?.[0]?.callback_data).toBe("confirm");
    }
  });

  it("dispatches image", () => {
    const call = buildApiCall("1", { type: "image", url: "https://example.com/img.png" });
    expect(call.method).toBe("sendPhoto");
  });
});
