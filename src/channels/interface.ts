import type { InboundMessage, OutboundMessage } from '../types/messages.js'

/** Adapts a messaging platform to the framework's normalized message types */
export interface ChannelAdapter {
  /** Parse a raw webhook payload. Returns null for non-message events (status updates, etc.) */
  parseInbound(rawPayload: unknown): InboundMessage | null

  /** Send a normalized message through the channel */
  sendOutbound(to: string, message: OutboundMessage): Promise<void>
}
