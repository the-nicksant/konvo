import type { Option, OutboundMessage } from "../../types/messages.js";

/** Telegram inline keyboard button */
interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

/** Body for Telegram sendMessage API call */
export interface TelegramSendMessageBody {
  chat_id: string;
  text: string;
  reply_markup?: { inline_keyboard: InlineKeyboardButton[][] };
}

/** Body for Telegram sendPhoto API call */
export interface TelegramSendPhotoBody {
  chat_id: string;
  photo: string;
  caption?: string;
}

/** Discriminated union of Telegram API calls we make */
export type TelegramApiCall =
  | { method: "sendMessage"; body: TelegramSendMessageBody }
  | { method: "sendPhoto"; body: TelegramSendPhotoBody };

/**
 * Build a plain text sendMessage call.
 */
export function buildTextCall(chatId: string, text: string): TelegramApiCall {
  return { method: "sendMessage", body: { chat_id: chatId, text } };
}

/**
 * Build a sendMessage call with an inline keyboard.
 * Each option is rendered as its own row so labels are never truncated.
 */
export function buildOptionsCall(chatId: string, text: string, options: Option[]): TelegramApiCall {
  const inline_keyboard = options.map((o): InlineKeyboardButton[] => [
    { text: o.label, callback_data: o.id },
  ]);
  return {
    method: "sendMessage",
    body: { chat_id: chatId, text, reply_markup: { inline_keyboard } },
  };
}

/**
 * Build a sendMessage call with a Yes/No inline keyboard for confirmations.
 * Both buttons are placed on the same row.
 */
export function buildConfirmationCall(
  chatId: string,
  text: string,
  confirmLabel = "Yes",
  cancelLabel = "No",
): TelegramApiCall {
  return {
    method: "sendMessage",
    body: {
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: [
          [
            { text: confirmLabel, callback_data: "confirm" },
            { text: cancelLabel, callback_data: "cancel" },
          ],
        ],
      },
    },
  };
}

/**
 * Build a sendPhoto call. Falls back to sendMessage with the URL when the URL
 * is not a file_id and Telegram cannot fetch the photo directly.
 */
export function buildImageCall(chatId: string, url: string, caption?: string): TelegramApiCall {
  if (caption !== undefined) {
    return { method: "sendPhoto", body: { chat_id: chatId, photo: url, caption } };
  }
  return { method: "sendPhoto", body: { chat_id: chatId, photo: url } };
}

/**
 * Build the correct Telegram API call for any OutboundMessage.
 */
export function buildApiCall(chatId: string, message: OutboundMessage): TelegramApiCall {
  switch (message.type) {
    case "text":
      return buildTextCall(chatId, message.text);
    case "options":
      return buildOptionsCall(chatId, message.text, message.options);
    case "confirmation":
      return buildConfirmationCall(chatId, message.text, message.confirmLabel, message.cancelLabel);
    case "image":
      return buildImageCall(chatId, message.url, message.caption);
  }
}
