# @konvo/playground — Design Document

**Date:** 2026-04-27
**Status:** Approved
**Phase:** 2

---

## Problem

Developers building konvo agents must set up WhatsApp Cloud API credentials, register a webhook, and use a real phone to test their bot. This creates a slow feedback loop and a high barrier to entry when demoing or developing locally.

## Goal

A local playground that lets developers test their konvo agent in a browser — no WhatsApp setup required. Secondary goal: a demo-ready UI that visually shows the agent reasoning in real time (tool calls, workflow transitions, session state), making it compelling for interviews and showcases.

---

## Architecture

`@konvo/playground` is a separate npm package (dev dependency). It has three parts:

```
packages/playground/
├── src/
│   ├── adapter.ts        # SimulatorAdapter — ChannelAdapter implementation
│   ├── server.ts         # Local HTTP + WebSocket bridge server
│   ├── cli.ts            # CLI entrypoint (bin: konvo-playground)
│   └── ui/               # React app (Vite)
│       ├── App.tsx
│       ├── ChatPanel.tsx
│       └── ReasoningPanel.tsx
```

**Three moving parts at runtime:**

```
Browser UI (localhost:4000)
    ↕ WebSocket
Playground bridge server (localhost:4001)   ← npx @konvo/playground
    ↕ WebSocket
SimulatorAdapter (inside user's konvo process on port 3000)
```

---

## Integration

### User-side (one env var check)

```typescript
import { Konvo } from 'konvo'
import { SimulatorAdapter } from '@konvo/playground/adapter'
import { whatsapp } from 'konvo/channels/whatsapp'

const channel = process.env.NODE_ENV === 'development'
  ? new SimulatorAdapter()
  : whatsapp({ ... })

const agent = new Konvo({
  agent: { model: openai('gpt-4o-mini'), instructions: '...' },
  tools: [...],
  channel,
  onStepFinish: channel instanceof SimulatorAdapter
    ? channel.debugHandler
    : undefined,
})

agent.listen(3000)
```

### Dev workflow

```bash
# Terminal 1 — user's konvo server
NODE_ENV=development node src/index.ts

# Terminal 2 — playground UI
npx @konvo/playground
# Opens http://localhost:4000
```

---

## Konvo Core Changes

One new optional field in `KonvoConfig`:

```typescript
// src/types/config.ts
onStepFinish?: (event: {
  toolCalls: ToolCall[]
  toolResults: ToolResult[]
  stepType: string
}) => void
```

This hooks into the `onStepFinish` callback that AI SDK's `generateText()` already fires. No logic changes — just plumbing the callback through. The `SimulatorAdapter.debugHandler` is a function that forwards these events over WebSocket to the playground bridge.

---

## Data Flow

```
1.  User types in browser chat → POST to bridge (localhost:4001)
2.  Bridge formats a fake WhatsApp webhook payload
3.  Bridge POSTs to konvo's /webhook (localhost:3000)
4.  Konvo responds 200 OK immediately, processes async
5.  Router calls generateText() — onStepFinish fires for each tool call
6.  SimulatorAdapter forwards tool call events → WebSocket → bridge → browser
7.  ReasoningPanel updates live as each tool fires
8.  Router finishes → calls adapter.sendOutbound()
9.  SimulatorAdapter sends outbound message → WebSocket → bridge → browser
10. ChatPanel renders the bot's response
```

### Event types

```typescript
type DebugEvent =
  | { type: 'tool_call'; tool: string; input: unknown; timestamp: Date }
  | { type: 'tool_result'; tool: string; result: unknown; duration: number }
  | { type: 'workflow_step'; step: string; state: WorkflowState }
  | { type: 'message_out'; content: OutboundMessage }
  | { type: 'session_snapshot'; session: Session }
```

The `session_snapshot` fires after each completed turn.

---

## Browser UI

Two-panel layout:

```
┌─────────────────────────────────────────────────────┐
│  konvo playground                    session: wa_123 │
├──────────────────────────┬──────────────────────────┤
│  Chat                    │  Agent Reasoning          │
│                          │                           │
│  [bot] Olá! Como posso   │  ▶ tool_call              │
│        ajudar?           │    listAppointments       │
│                          │    { customerId: "42" }   │
│  [you] quero remarcar    │                           │
│                          │  ✓ tool_result  (312ms)   │
│  [bot] Aqui estão seus   │    [ { id: 1, date:... }] │
│        horários:         │                           │
│        • 10:00 Dra. Ana  │  ▶ workflow_step          │
│        • 14:00 Dr. Carlos│    pickSlot               │
│                          │                           │
│  ┌──────────────────┐    │  📦 Session               │
│  │ Type a message...|    │    workflow: reschedule   │
│  └──────────────────┘    │    step: pickSlot         │
└──────────────────────────┴──────────────────────────┘
```

**UI behaviors:**
- `options` messages render as clickable chips/buttons (mirrors WhatsApp UX)
- `confirmation` messages render as Confirm / Cancel buttons
- Reasoning panel events are color-coded: blue (tool_call), green (tool_result), yellow (workflow_step)
- Session snapshot is an expandable JSON tree at the bottom of the reasoning panel
- Works out of the box with any konvo agent — no extra config

---

## Tech Stack

| Part | Technology |
|---|---|
| Adapter + bridge server | Node.js, `ws` (WebSocket) |
| CLI | Node.js, minimal arg parsing |
| React UI | React 18, Vite |
| Styling | Tailwind CSS (scoped, no conflicts) |

---

## Package Exports

```json
{
  "name": "@konvo/playground",
  "bin": { "konvo-playground": "./dist/cli.js" },
  "exports": {
    "./adapter": "./dist/adapter.js"
  },
  "devDependencies": {
    "react": "^18.0.0",
    "vite": "^5.0.0"
  },
  "dependencies": {
    "ws": "^8.0.0"
  }
}
```

The adapter (`./adapter`) is the only runtime import — everything else is CLI/build tooling.

---

## Out of Scope

- Multi-user simulation (one session at a time for now)
- Auth flow simulation (auth gate runs as normal)
- Recording/replay of conversations
- Mobile-responsive UI
