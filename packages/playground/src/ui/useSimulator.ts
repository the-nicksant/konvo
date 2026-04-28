import { useState, useEffect, useRef, useCallback } from 'react'
import type { ChatMessage, DebugEvent } from './types'

let msgCounter = 0
const uid = () => `msg_${++msgCounter}_${Date.now()}`

export function useSimulator() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [events, setEvents] = useState<DebugEvent[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)

    ws.onmessage = (e: MessageEvent) => {
      const event = JSON.parse(e.data as string) as DebugEvent
      if (event.type === 'message_out') {
        setMessages((prev) => [
          ...prev,
          { role: 'bot', content: event.content, id: uid() },
        ])
      }
      setEvents((prev) => [...prev, event])
    }

    return () => ws.close()
  }, [])

  const send = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { role: 'user', text, id: uid() }])
    setEvents([])

    await fetch('/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'sim_user_001',
        text,
        messageId: `sim_${Date.now()}`,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    })
  }, [])

  const selectOption = useCallback((label: string) => {
    void send(label)
  }, [send])

  return { messages, events, connected, send, selectOption }
}
