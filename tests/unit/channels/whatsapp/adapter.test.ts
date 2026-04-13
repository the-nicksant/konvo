import { describe, expect, it } from "vitest";
import { WhatsAppAdapter } from "../../../../src/channels/whatsapp/adapter.js";
import {
  buttonReplyPayload,
  imagePayload,
  listReplyPayload,
  locationPayload,
  statusUpdatePayload,
  textMessagePayload,
} from "../../../fixtures/webhook-payloads.js";

const adapter = new WhatsAppAdapter({
  phoneNumberId: "PHONE_ID",
  accessToken: "TOKEN",
  verifyToken: "VERIFY",
  appSecret: "SECRET",
});

describe("parseInbound — text message", () => {
  it("extracts channelUserId and text content", () => {
    const msg = adapter.parseInbound(textMessagePayload);
    expect(msg).not.toBeNull();
    expect(msg?.channelUserId).toBe("5511999887766");
    expect(msg?.content).toEqual({ type: "text", text: "quero remarcar minha consulta" });
  });

  it("extracts userName from contacts", () => {
    const msg = adapter.parseInbound(textMessagePayload);
    expect(msg?.userName).toBe("Maria Silva");
  });

  it("extracts messageId and timestamp", () => {
    const msg = adapter.parseInbound(textMessagePayload);
    expect(msg?.messageId).toBe("wamid.text001");
    expect(msg?.timestamp).toBeInstanceOf(Date);
    expect(msg?.timestamp.toISOString()).toBe(new Date(1736000000 * 1000).toISOString());
  });
});

describe("parseInbound — button reply", () => {
  it("returns button_reply content with id and text", () => {
    const msg = adapter.parseInbound(buttonReplyPayload);
    expect(msg?.content).toEqual({ type: "button_reply", buttonId: "confirm", text: "Yes" });
  });
});

describe("parseInbound — list reply", () => {
  it("returns list_reply content with itemId and text", () => {
    const msg = adapter.parseInbound(listReplyPayload);
    expect(msg?.content).toEqual({
      type: "list_reply",
      itemId: "slot_14h",
      text: "14:00 — Dr. Santos",
    });
  });
});

describe("parseInbound — image", () => {
  it("returns image content with mediaId and caption", () => {
    const msg = adapter.parseInbound(imagePayload);
    expect(msg?.content).toEqual({
      type: "image",
      mediaId: "media_img_001",
      caption: "my prescription",
    });
  });
});

describe("parseInbound — location", () => {
  it("returns location content with lat and lng", () => {
    const msg = adapter.parseInbound(locationPayload);
    expect(msg?.content).toEqual({ type: "location", lat: -23.5505, lng: -46.6333 });
  });
});

describe("parseInbound — non-message events", () => {
  it("returns null for status updates", () => {
    expect(adapter.parseInbound(statusUpdatePayload)).toBeNull();
  });

  it("returns null for a null payload", () => {
    expect(adapter.parseInbound(null)).toBeNull();
  });

  it("returns null for an empty object", () => {
    expect(adapter.parseInbound({})).toBeNull();
  });

  it("returns null for a payload with empty messages array", () => {
    const payload = {
      entry: [{ changes: [{ value: { messages: [] } }] }],
    };
    expect(adapter.parseInbound(payload)).toBeNull();
  });
});
