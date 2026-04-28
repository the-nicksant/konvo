import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, OutboundMessage } from './types'

interface Props {
  messages: ChatMessage[]
  onSend: (text: string) => void
  onSelectOption: (label: string) => void
}

export function ChatPanel({ messages, onSend, onSelectOption }: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  return (
    <div style={styles.panel}>
      <div style={styles.messages}>
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <div key={msg.id} style={styles.userBubble}>{msg.text}</div>
          ) : (
            <BotMessage key={msg.id} content={msg.content} onSelect={onSelectOption} />
          )
        )}
        <div ref={bottomRef} />
      </div>
      <div style={styles.inputRow}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
        />
        <button style={styles.sendBtn} onClick={handleSend} type="button">
          Send
        </button>
      </div>
    </div>
  )
}

function BotMessage({ content, onSelect }: { content: OutboundMessage; onSelect: (label: string) => void }) {
  if (content.type === 'text') {
    return <div style={styles.botBubble}>{content.text}</div>
  }

  if (content.type === 'options') {
    return (
      <div style={styles.botBubble}>
        <div style={{ marginBottom: 8 }}>{content.text}</div>
        <div style={styles.optionRow}>
          {content.options.map((opt) => (
            <button
              key={opt.id}
              style={styles.optionBtn}
              onClick={() => onSelect(opt.label)}
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (content.type === 'confirmation') {
    return (
      <div style={styles.botBubble}>
        <div style={{ marginBottom: 8 }}>{content.text}</div>
        <div style={styles.optionRow}>
          <button
            style={{ ...styles.optionBtn, background: '#25D366', color: '#fff' }}
            onClick={() => onSelect(content.confirmLabel ?? 'Confirm')}
            type="button"
          >
            {content.confirmLabel ?? 'Confirm'}
          </button>
          <button
            style={{ ...styles.optionBtn, background: '#f44336', color: '#fff' }}
            onClick={() => onSelect(content.cancelLabel ?? 'Cancel')}
            type="button"
          >
            {content.cancelLabel ?? 'Cancel'}
          </button>
        </div>
      </div>
    )
  }

  return null
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid #ddd',
    background: '#e5ddd5',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    background: '#dcf8c6',
    borderRadius: '12px 12px 2px 12px',
    padding: '8px 12px',
    maxWidth: '70%',
    fontSize: 14,
  },
  botBubble: {
    alignSelf: 'flex-start',
    background: '#fff',
    borderRadius: '12px 12px 12px 2px',
    padding: '8px 12px',
    maxWidth: '70%',
    fontSize: 14,
  },
  optionRow: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  optionBtn: {
    padding: '6px 14px',
    borderRadius: 20,
    border: '1px solid #128C7E',
    background: '#fff',
    color: '#128C7E',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    background: '#f0f2f5',
    borderTop: '1px solid #ddd',
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: 24,
    border: '1px solid #ccc',
    fontSize: 14,
    outline: 'none',
  },
  sendBtn: {
    padding: '10px 20px',
    borderRadius: 24,
    border: 'none',
    background: '#128C7E',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
  },
}
