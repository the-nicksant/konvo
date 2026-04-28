# @konvo/playground Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `@konvo/playground` — a separate npm package providing a local browser-based simulator for testing konvo agents without WhatsApp credentials.

**Architecture:** Three moving parts: (1) `SimulatorAdapter` implements `ChannelAdapter`, registers `/simulate` HTTP route on konvo's server, and opens a WebSocket server on port 4001 to push events to the bridge; (2) the bridge CLI connects to the SimulatorAdapter WS, serves the React UI on port 4000, and relays events to the browser; (3) konvo core gains one optional `onStepFinish` hook threaded through config → processor → router → `generateText()` so tool calls are streamed live.

**Tech Stack:** TypeScript, React 18, Vite 5, `ws` (WebSocket), pnpm workspaces monorepo, tsup

---

## Task 1: Monorepo setup

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `/Users/nicolas/repos/konvo/package.json` (root)

**Step 1: Add pnpm-workspace.yaml**

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
```

**Step 2: Verify pnpm recognizes the workspace**

```bash
pnpm install
```

Expected: No errors. Workspace is initialized.

**Step 3: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "chore: configure pnpm workspace monorepo"
```

---

## Task 2: Package scaffold

**Files:**
- Create: `packages/playground/package.json`
- Create: `packages/playground/tsconfig.json`
- Create: `packages/playground/tsup.config.ts`
- Create: `packages/playground/vite.config.ts`
- Create: `packages/playground/src/ui/index.html`
- Create: `packages/playground/src/ui/main.tsx`

**Step 1: Create package.json**

```json
{
  "name": "@konvo/playground",
  "version": "0.1.0",
  "description": "Local browser simulator for testing konvo agents",
  "type": "module",
  "license": "MIT",
  "bin": {
    "konvo-playground": "./dist/cli.js"
  },
  "exports": {
    "./adapter": {
      "import": "./dist/adapter.js",
      "types": "./dist/adapter.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "pnpm build:adapter && pnpm build:ui",
    "build:adapter": "tsup",
    "build:ui": "vite build",
    "dev:ui": "vite",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@types/ws": "^8.5.0",
    "@vitejs/plugin-react": "^4.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.0.0",
    "vitest": "^3.0.0"
  },
  "peerDependencies": {
    "konvo": "workspace:*"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"],
  "exclude": ["src/ui", "node_modules", "dist"]
}
```

**Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { adapter: 'src/adapter.ts' },
    format: ['esm'],
    dts: true,
    clean: false,
    target: 'node20',
    external: ['ws', 'konvo'],
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    target: 'node20',
    external: ['ws'],
    banner: { js: '#!/usr/bin/env node' },
  },
])
```

**Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'src/ui',
  build: {
    outDir: '../../dist/ui',
    emptyOutDir: true,
  },
  server: {
    port: 4000,
  },
})
```

**Step 5: Create src/ui/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>konvo playground</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

**Step 6: Create src/ui/main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

**Step 7: Install dependencies**

```bash
cd packages/playground && pnpm install
```

Expected: No errors.

**Step 8: Commit**

```bash
git add packages/playground/
git commit -m "feat(playground): scaffold @konvo/playground package"
```

---

## Task 3: Konvo core — add `onStepFinish` hook

**Files:**
- Modify: `src/types/config.ts` (add optional field)
- Modify: `src/core/processor.ts` (thread through ProcessorConfig)
- Modify: `src/server/create-server.ts` (pass to processorConfig)
- Modify: `src/core/router.ts` (pass to generateText)
- Modify: `tests/unit/core/router.test.ts` (add test)

**Step 1: Write the failing test first**

Open `tests/unit/core/router.test.ts` and add at an appropriate location:

```typescript
it('calls onStepFinish with tool call data when a tool is invoked', async () => {
  const stepFinishEvents: Array<{ toolCalls: unknown[]; toolResults: unknown[] }> = []

  const mockTool = defineTool({
    name: 'greet',
    description: 'Use to greet',
    parameters: z.object({ name: z.string() }),
    execute: async ({ name }) => `Hello, ${name}`,
  })

  await routeNewMessage(
    createTestSession(),
    'say hello to Alice',
    {
      model: createMockModelWithToolCall('greet', { name: 'Alice' }, 'Hello, Alice'),
      instructions: 'You are a test assistant.',
      onStepFinish: (event) => stepFinishEvents.push(event),
    },
    [mockTool],
    mockChannelAdapter(),
    new MemoryStore(),
  )

  expect(stepFinishEvents.length).toBeGreaterThan(0)
  expect(stepFinishEvents[0].toolCalls[0]).toMatchObject({ toolName: 'greet' })
})
```

**Step 2: Run the test to verify it fails**

```bash
cd /Users/nicolas/repos/konvo && pnpm test tests/unit/core/router.test.ts
```

Expected: FAIL — `onStepFinish` not a recognized param.

**Step 3: Add `onStepFinish` to `KonvoConfig`**

In `src/types/config.ts`, add inside `KonvoConfig` after the `historyWindow` field:

```typescript
/**
 * Called after each LLM step (tool call round-trip).
 * Use with SimulatorAdapter.debugHandler to stream tool events to the playground.
 *
 * @example
 * onStepFinish: channel instanceof SimulatorAdapter ? channel.debugHandler : undefined
 */
onStepFinish?: (event: {
  toolCalls: Array<{ toolName: string; args: unknown }>
  toolResults: Array<{ toolName: string; result: unknown }>
}) => void | Promise<void>
```

**Step 4: Add `onStepFinish` to `ProcessorConfig`**

In `src/core/processor.ts`, add to the `ProcessorConfig` interface:

```typescript
onStepFinish?: (event: {
  toolCalls: Array<{ toolName: string; args: unknown }>
  toolResults: Array<{ toolName: string; result: unknown }>
}) => void | Promise<void>
```

**Step 5: Pass it through `create-server.ts`**

In `src/server/create-server.ts`, inside the `processorConfig` object construction, add:

```typescript
...(config.onStepFinish !== undefined && { onStepFinish: config.onStepFinish }),
```

**Step 6: Pass it through `processor.ts` to `routeNewMessage`**

In `src/core/processor.ts`, in the `routeNewMessage(...)` call, add `config.onStepFinish` to the config object:

```typescript
await routeNewMessage(
  session,
  text,
  {
    model: config.agent.model,
    instructions: config.agent.instructions,
    ...(config.agent.maxSteps !== undefined && { maxSteps: config.agent.maxSteps }),
    ...(config.safety !== undefined && { safety: config.safety }),
    ...(config.onStepFinish !== undefined && { onStepFinish: config.onStepFinish }),
  },
  availableTools,
  config.channel,
  store,
  config.historyWindow,
)
```

**Step 7: Accept and wire `onStepFinish` in `router.ts`**

In `src/core/router.ts`, add `onStepFinish` to the `config` parameter type in `routeNewMessage`:

```typescript
config: {
  model: LanguageModel
  instructions: string
  maxSteps?: number
  safety?: SafetyConfig
  onStepFinish?: (event: {
    toolCalls: Array<{ toolName: string; args: unknown }>
    toolResults: Array<{ toolName: string; result: unknown }>
  }) => void | Promise<void>
}
```

Then in the `generateText()` call, add the `onStepFinish` option:

```typescript
const result = await generateText({
  model: config.model,
  system: systemPrompt,
  messages: session.messages,
  ...(hasTools && { tools: aiTools }),
  stopWhen: stepCountIs(config.maxSteps ?? DEFAULT_MAX_STEPS),
  ...(config.onStepFinish !== undefined && {
    onStepFinish: (stepResult) => {
      return config.onStepFinish!({
        toolCalls: stepResult.toolCalls.map((c) => ({
          toolName: c.toolName,
          args: c.args,
        })),
        toolResults: stepResult.toolResults.map((r) => ({
          toolName: r.toolName,
          result: (r as { result: unknown }).result,
        })),
      })
    },
  }),
})
```

**Step 8: Run the test to verify it passes**

```bash
pnpm test tests/unit/core/router.test.ts
```

Expected: PASS

**Step 9: Run full test suite to check for regressions**

```bash
pnpm test
```

Expected: All passing.

**Step 10: Commit**

```bash
git add src/types/config.ts src/core/processor.ts src/server/create-server.ts src/core/router.ts tests/unit/core/router.test.ts
git commit -m "feat(core): add optional onStepFinish hook for playground debug streaming"
```

---

## Task 4: SimulatorAdapter

**Files:**
- Create: `packages/playground/src/adapter.ts`
- Create: `packages/playground/tests/adapter.test.ts`

**Step 1: Write failing tests**

Create `packages/playground/tests/adapter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SimulatorAdapter } from '../src/adapter'

describe('SimulatorAdapter', () => {
  let adapter: SimulatorAdapter

  beforeEach(() => {
    adapter = new SimulatorAdapter({ adapterPort: 0 }) // port 0 = random free port
  })

  afterEach(async () => {
    await adapter.close()
  })

  describe('parseInbound', () => {
    it('parses a simulator payload into InboundMessage', () => {
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
  })

  describe('sendOutbound', () => {
    it('resolves without throwing when no clients are connected', async () => {
      await expect(
        adapter.sendOutbound('sim_user_001', { type: 'text', text: 'Hi' })
      ).resolves.toBeUndefined()
    })
  })
})
```

**Step 2: Run to verify failure**

```bash
cd packages/playground && pnpm test
```

Expected: FAIL — `SimulatorAdapter` not found.

**Step 3: Implement `SimulatorAdapter`**

Create `packages/playground/src/adapter.ts`:

```typescript
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
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/playground && pnpm test
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/playground/src/adapter.ts packages/playground/tests/adapter.test.ts
git commit -m "feat(playground): implement SimulatorAdapter with WS server and debug handler"
```

---

## Task 5: Bridge server

**Files:**
- Create: `packages/playground/src/bridge.ts`

The bridge is the glue between browser ↔ SimulatorAdapter. It:
1. Connects to the SimulatorAdapter WS server (receives outbound messages + debug events)
2. Opens a WS server for the browser (port 4000)
3. Serves the pre-built React UI static files via HTTP
4. Accepts `POST /send` from the browser and forwards to konvo `/simulate`

**Step 1: Implement `bridge.ts`**

```typescript
import { createServer as createHttpServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer, WebSocket } from 'ws'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const UI_DIR = join(__dirname, 'ui')

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
}

interface BridgeOptions {
  /** Port for the browser-facing HTTP+WS server. Default: 4000 */
  port?: number
  /** Port the SimulatorAdapter WS server is listening on. Default: 4001 */
  adapterPort?: number
  /** Port the konvo HTTP server is running on. Default: 3000 */
  konvoPort?: number
}

export async function startBridge({
  port = 4000,
  adapterPort = 4001,
  konvoPort = 3000,
}: BridgeOptions = {}): Promise<void> {
  // Browser-facing WebSocket server (piggybacks on the HTTP server)
  const browserClients = new Set<WebSocket>()

  const httpServer = createHttpServer((req, res) => {
    if (req.method === 'POST' && req.url === '/send') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        // Forward to konvo /simulate
        fetch(`http://localhost:${konvoPort}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }).catch((err) => console.error('[bridge] Failed to forward to konvo:', err))
        res.writeHead(200)
        res.end()
      })
      return
    }

    // Serve static UI files
    let urlPath = req.url ?? '/'
    if (urlPath === '/') urlPath = '/index.html'
    const filePath = join(UI_DIR, urlPath)

    if (!existsSync(filePath)) {
      // SPA fallback
      const index = join(UI_DIR, 'index.html')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(readFileSync(index))
      return
    }

    const ext = extname(filePath)
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
    res.end(readFileSync(filePath))
  })

  // Browser WebSocket server — attached to same HTTP server
  const browserWss = new WebSocketServer({ server: httpServer })
  browserWss.on('connection', (ws) => {
    browserClients.add(ws)
    ws.on('close', () => browserClients.delete(ws))
  })

  // Connect to SimulatorAdapter WS and relay events to browser
  await connectToAdapter(adapterPort, browserClients)

  await new Promise<void>((resolve) => httpServer.listen(port, resolve))
  console.log(`[konvo/playground] UI running at http://localhost:${port}`)
  console.log(`[konvo/playground] Connecting to konvo at http://localhost:${konvoPort}`)
}

async function connectToAdapter(
  adapterPort: number,
  browserClients: Set<WebSocket>,
  retries = 10,
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${adapterPort}`)
        ws.on('open', () => {
          console.log(`[konvo/playground] Connected to SimulatorAdapter on port ${adapterPort}`)
          ws.on('message', (data) => {
            const msg = data.toString()
            for (const client of browserClients) {
              if (client.readyState === client.OPEN) client.send(msg)
            }
          })
          resolve()
        })
        ws.on('error', reject)
      })
      return
    } catch {
      if (attempt === retries) {
        throw new Error(
          `[konvo/playground] Could not connect to SimulatorAdapter on port ${adapterPort}. ` +
          `Is your konvo server running with SimulatorAdapter?`
        )
      }
      console.log(`[konvo/playground] Waiting for SimulatorAdapter... (attempt ${attempt}/${retries})`)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}
```

**Step 2: Commit**

```bash
git add packages/playground/src/bridge.ts
git commit -m "feat(playground): implement bridge server (HTTP + WS relay)"
```

---

## Task 6: CLI entrypoint

**Files:**
- Create: `packages/playground/src/cli.ts`

**Step 1: Implement `cli.ts`**

```typescript
import { startBridge } from './bridge.js'

const args = process.argv.slice(2)
const port = getArg(args, '--port', 4000)
const adapterPort = getArg(args, '--adapter-port', 4001)
const konvoPort = getArg(args, '--konvo-port', 3000)

console.log('[konvo/playground] Starting...')

startBridge({ port, adapterPort, konvoPort }).catch((err) => {
  console.error('[konvo/playground] Fatal error:', err.message)
  process.exit(1)
})

function getArg(args: string[], flag: string, defaultValue: number): number {
  const idx = args.indexOf(flag)
  if (idx !== -1 && args[idx + 1]) return Number(args[idx + 1])
  return defaultValue
}
```

**Step 2: Build to verify the CLI compiles**

```bash
cd packages/playground && pnpm build:adapter
```

Expected: `dist/adapter.js` and `dist/cli.js` created without errors.

**Step 3: Commit**

```bash
git add packages/playground/src/cli.ts
git commit -m "feat(playground): add CLI entrypoint for konvo-playground command"
```

---

## Task 7: React UI — App layout + ChatPanel

**Files:**
- Create: `packages/playground/src/ui/App.tsx`
- Create: `packages/playground/src/ui/ChatPanel.tsx`
- Create: `packages/playground/src/ui/useSimulator.ts`
- Create: `packages/playground/src/ui/types.ts`

**Step 1: Define shared types in `types.ts`**

```typescript
// packages/playground/src/ui/types.ts

export type OutboundMessage =
  | { type: 'text'; text: string }
  | { type: 'options'; text: string; options: Array<{ id: string; label: string }> }
  | { type: 'confirmation'; text: string; confirmLabel?: string; cancelLabel?: string }

export type ChatMessage =
  | { role: 'user'; text: string; id: string }
  | { role: 'bot'; content: OutboundMessage; id: string }

export type DebugEvent =
  | { type: 'tool_call'; toolName: string; args: unknown; timestamp: string }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | { type: 'message_out'; content: OutboundMessage }
```

**Step 2: Create `useSimulator.ts` custom hook**

```typescript
// packages/playground/src/ui/useSimulator.ts

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

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data) as DebugEvent
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
    send(label)
  }, [send])

  return { messages, events, connected, send, selectOption }
}
```

**Step 3: Create `App.tsx`**

```tsx
// packages/playground/src/ui/App.tsx

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
```

**Step 4: Create `ChatPanel.tsx`**

```tsx
// packages/playground/src/ui/ChatPanel.tsx

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
          <button style={{ ...styles.optionBtn, background: '#25D366', color: '#fff' }} onClick={() => onSelect(content.confirmLabel ?? 'Confirm')} type="button">
            {content.confirmLabel ?? 'Confirm'}
          </button>
          <button style={{ ...styles.optionBtn, background: '#f44336', color: '#fff' }} onClick={() => onSelect(content.cancelLabel ?? 'Cancel')} type="button">
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
```

**Step 5: Commit**

```bash
git add packages/playground/src/ui/
git commit -m "feat(playground): add React UI — App layout and ChatPanel"
```

---

## Task 8: React UI — ReasoningPanel

**Files:**
- Create: `packages/playground/src/ui/ReasoningPanel.tsx`

**Step 1: Implement `ReasoningPanel.tsx`**

```tsx
// packages/playground/src/ui/ReasoningPanel.tsx

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
```

**Step 2: Build the UI to verify it compiles**

```bash
cd packages/playground && pnpm build
```

Expected: `dist/ui/` directory with built assets, `dist/adapter.js`, `dist/cli.js` — no TypeScript errors.

**Step 3: Commit**

```bash
git add packages/playground/src/ui/ReasoningPanel.tsx
git commit -m "feat(playground): add ReasoningPanel — live tool call event stream"
```

---

## Task 9: Wire up clinic-bot example + smoke test

**Files:**
- Modify: `examples/clinic-bot/src/index.ts` (add SimulatorAdapter dev mode)
- Modify: `examples/clinic-bot/package.json` (add @konvo/playground devDependency)

**Step 1: Add `@konvo/playground` to clinic-bot devDependencies**

In `examples/clinic-bot/package.json`:

```json
"devDependencies": {
  "@konvo/playground": "workspace:*"
}
```

**Step 2: Add SimulatorAdapter to clinic-bot index.ts**

At the top of `examples/clinic-bot/src/index.ts`, replace or conditionally wrap the channel:

```typescript
import { SimulatorAdapter } from '@konvo/playground/adapter'

const isDev = process.env.NODE_ENV === 'development'

const channel = isDev
  ? new SimulatorAdapter()
  : new WhatsAppAdapter({ ... })

const agent = new Konvo({
  ...existingConfig,
  channel,
  ...(isDev && channel instanceof SimulatorAdapter && {
    onStepFinish: channel.debugHandler,
  }),
})
```

**Step 3: Install in the example**

```bash
cd examples/clinic-bot && pnpm install
```

**Step 4: Smoke test — start the stack**

Terminal 1:
```bash
cd examples/clinic-bot && NODE_ENV=development node src/index.ts
```

Expected output includes:
```
[konvo/simulator] WebSocket server listening on ws://localhost:4001
[konvo] Listening on http://localhost:3000
```

Terminal 2:
```bash
cd packages/playground && node dist/cli.js
```

Expected output includes:
```
[konvo/playground] Connected to SimulatorAdapter on port 4001
[konvo/playground] UI running at http://localhost:4000
```

Open `http://localhost:4000` in a browser. Send a message. Verify:
- Message appears in chat panel
- Bot response appears
- Tool calls (if triggered) appear in reasoning panel

**Step 5: Commit**

```bash
git add examples/clinic-bot/
git commit -m "feat(examples): wire SimulatorAdapter into clinic-bot for playground dev mode"
```

---

## Notes for the implementer

**AI SDK `onStepFinish` type:** The exact TypeScript type for the callback parameter depends on the AI SDK version installed. If you hit a type error, cast `stepResult.toolCalls` and `stepResult.toolResults` to `unknown[]` first, then map through them. The shape `{ toolName, args }` and `{ toolName, result }` is stable across v6.

**`ws` compatibility with ESM:** The `ws` package exports both CJS and ESM. Use `import { WebSocketServer, WebSocket } from 'ws'` — named imports work correctly in ESM mode.

**Bridge static file serving:** The bridge serves files from `dist/ui/` relative to the compiled `cli.js`. When publishing the npm package, ensure `dist/ui/` is included in `files`. For local development, run `pnpm build:ui` once before starting the CLI.

**Port conflicts:** Default ports are 3000 (konvo), 4001 (SimulatorAdapter WS), 4000 (bridge + browser). All are configurable via CLI flags if needed.
