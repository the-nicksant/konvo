import { useSimulator } from './useSimulator'
import { ChatPanel } from './ChatPanel'
import { ReasoningPanel } from './ReasoningPanel'

export function App() {
  const { messages, events, connected, send, selectOption } = useSimulator()

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <span style={styles.title}>konvo playground</span>
        <span style={{ color: connected ? '#4caf50' : '#f44336', fontSize: 13 }}>
          {connected ? '● connected' : '○ disconnected'}
        </span>
      </header>
      <div style={styles.body}>
        <ChatPanel messages={messages} onSend={send} onSelectOption={selectOption} />
        <ReasoningPanel events={events} />
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    fontFamily: 'system-ui, sans-serif',
    background: '#f0f2f5',
    color: '#111',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    background: '#128C7E',
    color: '#fff',
    fontSize: 16,
    fontWeight: 600,
  },
  title: { letterSpacing: '0.3px' },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
}
