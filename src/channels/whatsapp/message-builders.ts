import {
  ActionButtons,
  ActionList,
  Body,
  Button,
  Interactive,
  ListSection,
  Row,
} from "whatsapp-api-js/messages/interactive";
import { Text } from "whatsapp-api-js/messages/text";
import type { Option, OutboundMessage } from "../../types/messages.js";

/** Max buttons before switching to an interactive list */
const BUTTON_LIMIT = 3;

/**
 * Build a WhatsApp `Text` message.
 */
export function buildTextMessage(text: string): Text {
  return new Text(text);
}

/**
 * Build an interactive message for a list of options.
 * Uses Quick Reply buttons for ≤ 3 options, Interactive List for > 3.
 */
export function buildOptionsMessage(text: string, options: Option[]): Interactive {
  if (options.length <= BUTTON_LIMIT) {
    const buttons = options.map((o) => new Button(o.id, truncate(o.label, 20)));
    return new Interactive(
      new ActionButtons(...(buttons as [Button, ...Button[]])),
      new Body(text),
    );
  }

  const rows = options.map((o) => new Row(o.id, truncate(o.label, 24), o.description));
  return new Interactive(
    new ActionList("Options", new ListSection(undefined, ...(rows as [Row, ...Row[]]))),
    new Body(text),
  );
}

/**
 * Build a yes/no confirmation message (always rendered as buttons).
 */
export function buildConfirmationMessage(
  text: string,
  confirmLabel = "Yes",
  cancelLabel = "No",
): Interactive {
  return new Interactive(
    new ActionButtons(
      new Button("confirm", truncate(confirmLabel, 20)),
      new Button("cancel", truncate(cancelLabel, 20)),
    ),
    new Body(text),
  );
}

/**
 * Build the correct WhatsApp message object for any OutboundMessage.
 */
export function buildMessage(message: OutboundMessage): Text | Interactive {
  switch (message.type) {
    case "text":
      return buildTextMessage(message.text);
    case "options":
      return buildOptionsMessage(message.text, message.options);
    case "confirmation":
      return buildConfirmationMessage(message.text, message.confirmLabel, message.cancelLabel);
    case "image":
      // Image sending is deferred — fall back to a text link for now
      return buildTextMessage(message.caption ? `${message.url}\n${message.caption}` : message.url);
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
