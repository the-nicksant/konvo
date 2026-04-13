import { C as ChannelAdapter, a as InboundMessage, b as OutboundMessage } from '../interface-N6n0avsR.js';

interface WhatsAppConfig {
    /** Phone Number ID from Meta Developer Portal */
    phoneNumberId: string;
    /** Permanent access token */
    accessToken: string;
    /** Verify token you set when registering the webhook URL */
    verifyToken: string;
    /** App Secret for HMAC signature verification */
    appSecret: string;
}
/**
 * Create a WhatsApp Cloud API channel adapter.
 *
 * @example
 * ```typescript
 * import { whatsapp } from 'konvo/channels/whatsapp'
 * const channel = whatsapp({ phoneNumberId, accessToken, verifyToken, appSecret })
 * ```
 */
declare function whatsapp(config: WhatsAppConfig): ChannelAdapter & {
    config: WhatsAppConfig;
};
declare class WhatsAppAdapter implements ChannelAdapter {
    readonly config: WhatsAppConfig;
    constructor(config: WhatsAppConfig);
    parseInbound(_rawPayload: unknown): InboundMessage | null;
    sendOutbound(_to: string, _message: OutboundMessage): Promise<void>;
}

export { WhatsAppAdapter, type WhatsAppConfig, whatsapp };
