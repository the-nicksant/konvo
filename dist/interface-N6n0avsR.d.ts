/** Normalized inbound message from any channel */
interface InboundMessage {
    /** Platform-specific user identifier (e.g. phone number, Telegram ID) */
    channelUserId: string;
    /** Display name from the platform, if available */
    userName?: string;
    /** Platform message ID */
    messageId: string;
    timestamp: Date;
    content: InboundContent;
}
type InboundContent = {
    type: 'text';
    text: string;
} | {
    type: 'button_reply';
    buttonId: string;
    text: string;
} | {
    type: 'list_reply';
    itemId: string;
    text: string;
} | {
    type: 'image';
    mediaId: string;
    caption?: string;
} | {
    type: 'location';
    lat: number;
    lng: number;
} | {
    type: 'unsupported';
    raw: unknown;
};
/** Option for interactive messages (buttons / list rows) */
interface Option {
    /** Unique ID returned when the user selects this option */
    id: string;
    /** Label shown to the user (max 20 chars for WhatsApp buttons) */
    label: string;
    /** Optional description shown in list rows */
    description?: string;
}
/** Normalized outbound message sent through a channel */
type OutboundMessage = {
    type: 'text';
    text: string;
} | {
    type: 'options';
    text: string;
    options: Option[];
} | {
    type: 'confirmation';
    text: string;
    confirmLabel?: string;
    cancelLabel?: string;
} | {
    type: 'image';
    url: string;
    caption?: string;
};

/** Adapts a messaging platform to the framework's normalized message types */
interface ChannelAdapter {
    /** Parse a raw webhook payload. Returns null for non-message events (status updates, etc.) */
    parseInbound(rawPayload: unknown): InboundMessage | null;
    /** Send a normalized message through the channel */
    sendOutbound(to: string, message: OutboundMessage): Promise<void>;
}

export type { ChannelAdapter as C, InboundContent as I, Option as O, InboundMessage as a, OutboundMessage as b };
