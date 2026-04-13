import type { ChannelAdapter } from '../interface.js'
import type { InboundMessage, OutboundMessage } from '../../types/messages.js'

export interface WhatsAppConfig {
  /** Phone Number ID from Meta Developer Portal */
  phoneNumberId: string
  /** Permanent access token */
  accessToken: string
  /** Verify token you set when registering the webhook URL */
  verifyToken: string
  /** App Secret for HMAC signature verification */
  appSecret: string
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
export function whatsapp(config: WhatsAppConfig): ChannelAdapter & { config: WhatsAppConfig } {
  return new WhatsAppAdapter(config)
}

export class WhatsAppAdapter implements ChannelAdapter {
  constructor(readonly config: WhatsAppConfig) {}

  parseInbound(_rawPayload: unknown): InboundMessage | null {
    // Implementation in Step 4
    throw new Error('Not yet implemented')
  }

  async sendOutbound(_to: string, _message: OutboundMessage): Promise<void> {
    // Implementation in Step 4
    throw new Error('Not yet implemented')
  }
}
