import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SimulatorAdapter } from '../src/adapter.js'

describe('SimulatorAdapter', () => {
  let adapter: SimulatorAdapter

  beforeEach(() => {
    adapter = new SimulatorAdapter({ adapterPort: 0 }) // port 0 = random free port
  })

  afterEach(async () => {
    await adapter.close()
  })

  describe('parseInbound', () => {
    it('parses a valid simulator payload into InboundMessage', () => {
      const raw = {
        from: 'sim_user_001',
        text: 'Hello there',
        messageId: 'msg_123',
        timestamp: 1700000000,
      }
      const result = adapter.parseInbound(raw)
      expect(result).toMatchObject({
        channelUserId: 'sim_user_001',
        messageId: 'msg_123',
        content: { type: 'text', text: 'Hello there' },
      })
      expect(result?.timestamp).toBeInstanceOf(Date)
    })

    it('returns null for unrecognized payloads', () => {
      expect(adapter.parseInbound({ unexpected: true })).toBeNull()
    })

    it('returns null for missing required fields', () => {
      expect(adapter.parseInbound({ from: 'user', text: 'hi' })).toBeNull() // missing messageId + timestamp
    })
  })

  describe('sendOutbound', () => {
    it('resolves without throwing when no clients are connected', async () => {
      await expect(
        adapter.sendOutbound('sim_user_001', { type: 'text', text: 'Hi' })
      ).resolves.toBeUndefined()
    })
  })

  describe('debugHandler', () => {
    it('does not throw when no clients are connected', () => {
      expect(() => {
        adapter.debugHandler({
          toolCalls: [{ toolName: 'getAppointments', args: { id: '1' } }],
          toolResults: [{ toolName: 'getAppointments', result: [] }],
        })
      }).not.toThrow()
    })
  })
})
