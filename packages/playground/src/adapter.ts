import { WebSocketServer, type WebSocket } from 'ws'
import type { InboundMessage, OutboundMessage } from 'konvo'
import type { Hono } from 'hono'

type SimulatorPayload = {
  from: string
  text: string
  messageId: string
  timestamp: number
}

type DebugEvent =
  | { type: 'tool_call'; toolName: string; args: unknown; timestamp: string }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | { type: 'message_out'; content: OutboundMessage }

type WebhookHandler = (rawBody: unknown) => Promise<void>

interface SimulatorAdapterOptions {
  /** Port for the internal WebSocket server the bridge connects to. Default: 4001 */
  adapterPort?: number
}

/**
 * Channel adapter for the konvo local playground simulator.
 *
 * Replaces the WhatsApp adapter in development. Registers a /simulate HTTP route
 * and opens a WebSocket server that the playground bridge connects to for receiving
 * outbound messages and debug events.
 *
 * @example
 * ```typescript
 * const channel = process.env.NODE_ENV === 'development'
 *   ? new SimulatorAdapter()
 *   : whatsapp({ ... })
 *
 * const agent = new Konvo({
 *   channel,
 *   onStepFinish: channel instanceof SimulatorAdapter ? channel.debugHandler : undefined,
 * })
 * ```
 */
export class SimulatorAdapter {
  private wss: WebSocketServer
  readonly port: number

  constructor({ adapterPort = 4001 }: SimulatorAdapterOptions = {}) {
    this.wss = new WebSocketServer({ port: adapterPort })
    this.port = (this.wss.address() as { port: number }).port
    console.log(`[konvo/simulator] WebSocket server listening on ws://localhost:${this.port}`)
  }

  /**
   * Registers a /simulate POST route on the konvo Hono app.
   * The playground bridge posts inbound messages here instead of /webhook.
   */
  registerRoutes(app: Hono, handleUpdate: WebhookHandler): void {
    app.post('/simulate', async (c) => {
      const body = await c.req.json()
      // Fire-and-forget with error boundary — respond 200 immediately
      void handleUpdate(body).catch((err) => {
        console.error('[konvo/simulator] Error processing simulated message:', err)
      })
      return c.text('OK', 200)
    })
  }

  parseInbound(rawPayload: unknown): InboundMessage | null {
    const p = rawPayload as Partial<SimulatorPayload>
    if (!p.from || !p.text || !p.messageId || !p.timestamp) return null

    return {
      channelUserId: p.from,
      messageId: p.messageId,
      timestamp: new Date(p.timestamp * 1000),
      content: { type: 'text', text: p.text },
    }
  }

  async sendOutbound(_to: string, message: OutboundMessage): Promise<void> {
    this.broadcast({ type: 'message_out', content: message })
  }

  /**
   * Pass this to KonvoConfig.onStepFinish to stream tool call events to the playground.
   */
  debugHandler = (event: {
    toolCalls: Array<{ toolName: string; args: unknown }>
    toolResults: Array<{ toolName: string; result: unknown }>
  }): void => {
    const timestamp = new Date().toISOString()
    for (let i = 0; i < event.toolCalls.length; i++) {
      const call = event.toolCalls[i]
      this.broadcast({ type: 'tool_call', toolName: call.toolName, args: call.args, timestamp })
      const res = event.toolResults[i]
      if (res) {
        this.broadcast({ type: 'tool_result', toolName: res.toolName, result: res.result })
      }
    }
  }

  /** Close the WebSocket server. Call in tests to avoid port leaks. */
  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.wss.close((err) => (err ? reject(err) : resolve()))
    })
  }

  private broadcast(event: DebugEvent): void {
    const msg = JSON.stringify(event)
    for (const client of this.wss.clients) {
      if (client.readyState === (client as WebSocket).OPEN) {
        client.send(msg)
      }
    }
  }
}
