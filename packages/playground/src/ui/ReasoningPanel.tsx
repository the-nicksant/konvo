import { useRef, useEffect } from 'react'
import type { DebugEvent } from './types'

interface Props {
  events: DebugEvent[]
}

export function ReasoningPanel({ events }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <div style={styles.panel}>
      <div style={styles.heading}>Agent Reasoning</div>
      <div style={styles.events}>
        {events.length === 0 && (
          <div style={styles.empty}>Send a message to see tool calls and events here.</div>
        )}
        {events.map((event, i) => (
          <EventRow key={i} event={event} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function EventRow({ event }: { event: DebugEvent }) {
  if (event.type === 'tool_call') {
    return (
      <div style={{ ...styles.event, borderLeft: '3px solid #2196F3' }}>
        <div style={styles.eventTag}>▶ tool_call</div>
        <div style={styles.eventName}>{event.toolName}</div>
        <pre style={styles.pre}>{JSON.stringify(event.args, null, 2)}</pre>
      </div>
    )
  }

  if (event.type === 'tool_result') {
    return (
      <div style={{ ...styles.event, borderLeft: '3px solid #4CAF50' }}>
        <div style={styles.eventTag}>✓ tool_result</div>
        <div style={styles.eventName}>{event.toolName}</div>
        <pre style={styles.pre}>{JSON.stringify(event.result, null, 2)}</pre>
      </div>
    )
  }

  if (event.type === 'message_out') {
    return (
      <div style={{ ...styles.event, borderLeft: '3px solid #9E9E9E' }}>
        <div style={styles.eventTag}>↩ message_out</div>
        <pre style={styles.pre}>{JSON.stringify(event.content, null, 2)}</pre>
      </div>
    )
  }

  return null
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 380,
    display: 'flex',
    flexDirection: 'column',
    background: '#1e1e1e',
    color: '#d4d4d4',
  },
  heading: {
    padding: '12px 16px',
    fontSize: 13,
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    borderBottom: '1px solid #333',
  },
  events: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  empty: {
    color: '#555',
    fontSize: 13,
    fontStyle: 'italic',
    padding: '8px 4px',
  },
  event: {
    background: '#252526',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 12,
  },
  eventTag: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  eventName: {
    color: '#dcdcaa',
    fontFamily: 'monospace',
    fontWeight: 600,
    fontSize: 13,
    marginBottom: 4,
  },
  pre: {
    margin: 0,
    color: '#9cdcfe',
    fontFamily: 'monospace',
    fontSize: 11,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
}
