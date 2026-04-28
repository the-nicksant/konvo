import { describe, expect, it } from "vitest";
import { TelegramAdapter } from "../../../../src/channels/telegram/adapter.js";
import type { TelegramUpdate } from "../../../../src/channels/telegram/types.js";

const adapter = new TelegramAdapter({ token: "test-token" });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const textUpdate: TelegramUpdate = {
  update_id: 1,
  message: {
    message_id: 42,
    from: { id: 99, first_name: "Alice", last_name: "Smith" },
    chat: { id: 100, type: "private" },
    date: 1736000000,
    text: "Hello, bot!",
  },
};

const callbackUpdate: TelegramUpdate = {
  update_id: 2,
  callback_query: {
    id: "cbq-001",
    from: { id: 99, first_name: "Alice" },
    message: {
      message_id: 41,
      chat: { id: 100, type: "private" },
      date: 1735999900,
    },
    data: "option_a",
  },
};

const photoUpdate: TelegramUpdate = {
  update_id: 3,
  message: {
    message_id: 43,
    from: { id: 99, first_name: "Alice" },
    chat: { id: 100, type: "private" },
    date: 1736000100,
    photo: [
      { file_id: "small_id", file_unique_id: "u1", width: 90, height: 90 },
      { file_id: "large_id", file_unique_id: "u2", width: 800, height: 600 },
    ],
    caption: "My photo",
  },
};

const locationUpdate: TelegramUpdate = {
  update_id: 4,
  message: {
    message_id: 44,
    from: { id: 99, first_name: "Alice" },
    chat: { id: 100, type: "private" },
    date: 1736000200,
    location: { latitude: -23.5505, longitude: -46.6333 },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseInbound — text message", () => {
  it("extracts channelUserId from chat.id", () => {
    const msg = adapter.parseInbound(textUpdate);
    expect(msg?.channelUserId).toBe("100");
  });

  it("extracts text content", () => {
    const msg = adapter.parseInbound(textUpdate);
    expect(msg?.content).toEqual({ type: "text", text: "Hello, bot!" });
  });

  it("extracts full userName (first + last name)", () => {
    const msg = adapter.parseInbound(textUpdate);
    expect(msg?.userName).toBe("Alice Smith");
  });

  it("extracts messageId and timestamp", () => {
    const msg = adapter.parseInbound(textUpdate);
    expect(msg?.messageId).toBe("42");
    expect(msg?.timestamp).toEqual(new Date(1736000000 * 1000));
  });
});

describe("parseInbound — callback query", () => {
  it("returns button_reply content with the callback data as buttonId and text", () => {
    const msg = adapter.parseInbound(callbackUpdate);
    expect(msg?.content).toEqual({
      type: "button_reply",
      buttonId: "option_a",
      text: "option_a",
    });
  });

  it("uses the message chat.id as channelUserId", () => {
    const msg = adapter.parseInbound(callbackUpdate);
    expect(msg?.channelUserId).toBe("100");
  });

  it("prefixes messageId with cbq_", () => {
    const msg = adapter.parseInbound(callbackUpdate);
    expect(msg?.messageId).toBe("cbq_cbq-001");
  });

  it("returns null when callback_query has no data", () => {
    const update: TelegramUpdate = {
      update_id: 5,
      callback_query: { id: "cb2", from: { id: 1, first_name: "X" }, message: undefined, data: undefined },
    };
    expect(adapter.parseInbound(update)).toBeNull();
  });

  it("returns null when callback_query has no message (inline mode)", () => {
    const update: TelegramUpdate = {
      update_id: 6,
      callback_query: { id: "cb3", from: { id: 1, first_name: "X" }, data: "foo" },
    };
    expect(adapter.parseInbound(update)).toBeNull();
  });
});

describe("parseInbound — photo", () => {
  it("extracts highest-resolution photo as image content", () => {
    const msg = adapter.parseInbound(photoUpdate);
    expect(msg?.content).toEqual({ type: "image", mediaId: "large_id", caption: "My photo" });
  });

  it("omits caption when not present", () => {
    const update: TelegramUpdate = {
      ...photoUpdate,
      message: {
        ...photoUpdate.message!,
        caption: undefined,
      },
    };
    const msg = adapter.parseInbound(update);
    expect(msg?.content).toEqual({ type: "image", mediaId: "large_id" });
    expect(msg?.content).not.toHaveProperty("caption");
  });
});

describe("parseInbound — location", () => {
  it("extracts lat and lng", () => {
    const msg = adapter.parseInbound(locationUpdate);
    expect(msg?.content).toEqual({ type: "location", lat: -23.5505, lng: -46.6333 });
  });
});

describe("parseInbound — userName handling", () => {
  it("uses only first_name when last_name is absent", () => {
    const update: TelegramUpdate = {
      update_id: 7,
      message: {
        message_id: 45,
        from: { id: 99, first_name: "Bob" },
        chat: { id: 100, type: "private" },
        date: 1736000000,
        text: "hi",
      },
    };
    const msg = adapter.parseInbound(update);
    expect(msg?.userName).toBe("Bob");
  });

  it("omits userName when message has no from field", () => {
    const update: TelegramUpdate = {
      update_id: 8,
      message: {
        message_id: 46,
        chat: { id: 100, type: "private" },
        date: 1736000000,
        text: "channel post",
      },
    };
    const msg = adapter.parseInbound(update);
    expect(msg).not.toBeNull();
    expect(msg).not.toHaveProperty("userName");
  });
});

describe("parseInbound — unsupported / null cases", () => {
  it("returns null for an empty update object", () => {
    expect(adapter.parseInbound({})).toBeNull();
  });

  it("returns null for null payload", () => {
    expect(adapter.parseInbound(null)).toBeNull();
  });

  it("returns unsupported for a message with no text, photo, or location", () => {
    const update: TelegramUpdate = {
      update_id: 9,
      message: {
        message_id: 47,
        from: { id: 1, first_name: "X" },
        chat: { id: 100, type: "private" },
        date: 1736000000,
      },
    };
    const msg = adapter.parseInbound(update);
    expect(msg?.content.type).toBe("unsupported");
  });
});
