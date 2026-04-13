# Konvo — SPEC.md

> A TypeScript framework for connecting any REST API to a conversational AI agent exposed through messaging channels.

**Version:** 0.1.0 (Draft)
**Author:** Nicolas
**Last updated:** April 2026

---

## 1. Vision and positioning

### What is Konvo?

Konvo is an open-source TypeScript framework that lets developers turn any existing REST API into a conversational AI agent that end-users can interact with through messaging channels — primarily WhatsApp.

The developer defines their API tools, composes multi-step conversation workflows, configures authentication and safety rules, and the framework handles everything else: LLM orchestration, conversation state management, channel-specific UX rendering, session persistence, and compliance.

### The one-liner

> "Build Meta-compliant WhatsApp AI agents in 100 lines of TypeScript."

### Who is this for?

- Developers who have an existing business API and want to expose it as a conversational agent
- Teams building customer-facing WhatsApp bots for bookings, support, order tracking, etc.
- Agencies delivering AI chatbot solutions for clients (clinics, restaurants, e-commerce)

### What this is NOT

- A generic AI agent framework (use Mastra, VoltAgent, or AI SDK directly)
- A no-code chatbot builder (use respond.io, Autoflowly, or Chatbot Builder AI)
- An OpenAPI-to-MCP generator (use Stainless, openapi-mcp-generator, or FastMCP)
- A replacement for the WhatsApp Business App (this is for the Cloud API / programmatic use)

### Why does this exist?

There is no open-source TypeScript framework that bridges the gap between "I have an API" and "my customers can perform real business operations through WhatsApp." The existing landscape consists of:

- **Generic agent frameworks** (Mastra, VoltAgent, AI SDK) that require the developer to build the API ingestion, conversation design, channel adapters, auth, and safety from scratch
- **Proprietary SaaS platforms** (respond.io, Autoflowly, Wassenger) that are closed-source and lock you into their ecosystem
- **OpenAPI-to-MCP tools** (Stainless, openapi-mcp-generator) that do 1:1 endpoint mapping without conversation orchestration, workflow logic, or messaging channel support

Konvo owns the layer between your API and the conversational interface.

### Market context

- WhatsApp has 3+ billion active users. 175 million people message a WhatsApp Business account every day, growing 30% YoY.
- As of January 15, 2026, Meta banned general-purpose AI chatbots (ChatGPT, Perplexity) from WhatsApp Business API. Business-specific, task-oriented bots (support, bookings, order tracking) are explicitly allowed and encouraged.
- MCP reached 97 million monthly SDK downloads by March 2026 with 13,000+ public servers — the ecosystem for AI-tool integration is exploding.
- The TypeScript AI ecosystem is booming: Vercel AI SDK has 20M+ weekly downloads, Mastra has 22k GitHub stars.

---

## 2. Architecture overview

### Layered architecture

Konvo is structured as five tiers, each with a single responsibility and a clear interface to the tiers above and below:

```
┌─────────────────────────────────────────────────────────┐
│  Tier 1: HTTP / Webhook Layer                           │
│  Receives webhook payloads, serves health/admin routes  │
│  Built on: Hono                                         │
├─────────────────────────────────────────────────────────┤
│  Tier 2: Channel Adapter                                │
│  Parses inbound messages, formats outbound messages     │
│  Built on: whatsapp-api-js                              │
├─────────────────────────────────────────────────────────┤
│  Tier 3: Session Manager                                │
│  Per-conversation state, history, auth cache            │
│  Built on: Custom (pluggable: Memory/SQLite/Redis)      │
├─────────────────────────────────────────────────────────┤
│  Tier 4: Agent Core (the brain)                         │
│  LLM calls, tool execution, workflow orchestration      │
│  Built on: Vercel AI SDK                                │
├─────────────────────────────────────────────────────────┤
│  Tier 5: Tool Registry                                  │
│  API tool definitions, HTTP client, OpenAPI generation  │
│  Built on: Zod + AI SDK tool() + native fetch           │
└─────────────────────────────────────────────────────────┘
```

### Core dependencies

| Dependency | Role | Why this one |
|---|---|---|
| `ai` (Vercel AI SDK) | LLM calls, tool execution, multi-step agent loop | Unified API for all providers, TypeScript-native, 20M+ weekly downloads, functional patterns with Zod |
| `zod` | Schema validation for tool parameters, config, messages | Industry standard, AI SDK's native schema language |
| `hono` | HTTP server for webhooks and admin routes | ~14KB, runs everywhere (Node, Bun, Deno, Cloudflare Workers, Vercel Edge), no opinions about plugins |
| `whatsapp-api-js` | WhatsApp Cloud API interaction | Zero dependencies, fully typed, lightweight, handles all message types |
| `better-sqlite3` | Default persistent session store | Zero infrastructure, file-based, synchronous, fast for this workload |

**Peer dependencies** (user provides):
- `ai` (Vercel AI SDK) — so the user controls the version
- `zod` — shared with user's project
- Any AI SDK provider: `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, etc.

**Optional dependencies:**
- `ioredis` — for Redis session store (multi-instance deployments)
- `swagger-parser` — for OpenAPI spec auto-ingestion

### Design decisions

**Why AI SDK over LangChain/LangGraph?** LangChain uses deep abstraction layers and class inheritance. AI SDK uses functional patterns with Zod schemas — more TypeScript-idiomatic, lighter, and doesn't force the user into LangChain's ecosystem. Mastra itself is built on AI SDK, validating this choice. AI SDK v6 added durable agents, human-in-the-loop approval, and memory — covering our needs.

**Why Hono over Fastify/Express?** This ships as an npm package, not a standalone app. Hono is runtime-agnostic (works in Node, Bun, Deno, edge), tiny, and doesn't impose opinions. The framework user shouldn't need to learn a web framework's ecosystem just to run a bot.

**Why whatsapp-api-js over Meta's official SDK?** Meta's official Node.js SDK is heavier and has more opinions about server setup. whatsapp-api-js is zero-dependency, fully typed, and gives us clean control over message construction without bundling an Express server.

**Why SQLite as the default store?** Zero infrastructure — no Redis/Postgres server to manage. Persists across restarts (solving the critical "memory loss on restart" problem). Works perfectly for single-instance deployments which is what most WhatsApp bots are. Users can upgrade to Redis for multi-instance setups.

---

## 3. Data flow — end to end

A complete message lifecycle, from WhatsApp to API and back:

```
1.  User sends "quero remarcar minha consulta" on WhatsApp
2.  Meta POSTs webhook payload to the server
3.  Hono middleware verifies X-Hub-Signature-256 (security)
4.  Server responds 200 immediately (Meta requires < 20s, retries otherwise)
5.  WhatsApp adapter parses payload → InboundMessage { channelUserId, content }
6.  Session manager loads/creates session from persistent store (SQLite/Redis)
7.  Auth gate runs:
    a. Identify: resolve(phoneNumber) → UserIdentity
    b. Authenticate: authenticate(user) → allowed/denied
    c. Authorize: getPermissions(user) → allowed tools and workflows
    d. If denied → send rejection message, stop processing
8.  Check session state:
    a. If pending confirmation → handle as workflow response
    b. If active workflow → continue workflow at current step
    c. If no active state → route as new message
9.  Router agent calls AI SDK generateText() with:
    - System prompt (personality + customer context + allowed workflows)
    - Conversation history (bounded sliding window)
    - Filtered tools (only what this user's permissions allow)
10. LLM decides to call a tool (e.g. "listAppointments")
11. Safety middleware intercepts:
    - Classify action level (read/write/destructive)
    - Check rate limit
    - Require confirmation if needed
    - Log to audit store
12. Tool executes: fetch() to user's API with their auth token
13. LLM sees result, generates response (may trigger workflow)
14. Session updated: messages appended, workflow state set
15. Session persisted to store
16. Outbound message formatted by WhatsApp adapter
    (text, interactive list, quick reply buttons, etc.)
17. whatsapp-api-js sends message via Meta Graph API
18. User sees response on WhatsApp
```

---

## 4. Tier 1 — HTTP / Webhook layer

### Responsibility

Receive webhook payloads from messaging platforms. Verify signatures for security. Respond 200 immediately (async processing). Serve health and admin endpoints.

### Implementation

The server is created internally by the framework — the user doesn't configure Hono routes directly:

```typescript
// Internal: konvo/src/server/hono-server.ts
import { Hono } from 'hono'
import { verifyWebhookSignature } from './middleware/security'

export function createServer(config: KonvoConfig) {
  const app = new Hono()

  // WhatsApp webhook verification (GET)
  // Meta sends this when registering the webhook URL
  app.get('/webhook', (c) => {
    const mode = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const challenge = c.req.query('hub.challenge')
    if (mode === 'subscribe' && token === config.channel.verifyToken) {
      return c.text(challenge!, 200)
    }
    return c.text('Forbidden', 403)
  })

  // WhatsApp webhook (POST) — actual messages
  app.post(
    '/webhook',
    verifyWebhookSignature(config.channel.appSecret),
    async (c) => {
      const body = await c.req.json()
      const inbound = config.channelAdapter.parseInbound(body)
      if (!inbound) return c.text('OK', 200) // status update, not a message

      // Process async — MUST respond 200 within seconds
      c.executionCtx?.waitUntil(processMessage(inbound, config))
      return c.text('OK', 200)
    }
  )

  app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }))

  return app
}
```

### Webhook signature verification

Meta signs every webhook payload with HMAC-SHA256 using the app secret. The middleware validates this before processing:

```typescript
// Internal: konvo/src/server/middleware/security.ts
import { createHmac } from 'crypto'

export function verifyWebhookSignature(appSecret: string) {
  return async (c, next) => {
    const signature = c.req.header('x-hub-signature-256')
    if (!signature) return c.text('Missing signature', 401)

    const body = await c.req.text()
    const expected = 'sha256=' + createHmac('sha256', appSecret)
      .update(body).digest('hex')

    if (signature !== expected) return c.text('Invalid signature', 401)

    // Re-parse body for downstream handlers
    c.set('rawBody', body)
    await next()
  }
}
```

---

## 5. Tier 2 — Channel adapter

### Responsibility

Translate between platform-specific message formats and the framework's normalized `InboundMessage` / `OutboundMessage` types. Each platform (WhatsApp, Telegram, web) implements the `ChannelAdapter` interface.

### ChannelAdapter interface

```typescript
// konvo/src/channels/interface.ts

export interface ChannelAdapter {
  /** Parse a raw webhook payload into a normalized inbound message */
  parseInbound(rawPayload: unknown): InboundMessage | null

  /** Send a normalized outbound message through the channel */
  sendOutbound(to: string, message: OutboundMessage): Promise<void>
}
```

### Normalized message types

```typescript
// konvo/src/types/messages.ts

export interface InboundMessage {
  channelUserId: string        // phone number, telegram ID, etc.
  userName?: string            // display name from the platform
  messageId: string            // platform message ID
  timestamp: Date
  content: InboundContent
}

export type InboundContent =
  | { type: 'text'; text: string }
  | { type: 'button_reply'; buttonId: string; text: string }
  | { type: 'list_reply'; itemId: string; text: string }
  | { type: 'image'; mediaId: string; caption?: string }
  | { type: 'location'; lat: number; lng: number }
  | { type: 'unsupported'; raw: unknown }

export type OutboundMessage =
  | { type: 'text'; text: string }
  | { type: 'options'; text: string; options: Option[] }
  | { type: 'confirmation'; text: string; confirmLabel?: string; cancelLabel?: string }
  | { type: 'image'; url: string; caption?: string }
```

### WhatsApp adapter

The WhatsApp adapter uses `whatsapp-api-js` for sending messages and manually parses Meta's webhook payload (which has a deeply nested structure).

Key behaviors:
- Parses text messages, interactive button replies, list replies, images, and locations
- Automatically chooses between Quick Reply buttons (≤ 3 options) and Interactive Lists (> 3 options) when rendering options
- Handles the 24-hour conversation window rule
- Supports message templates for outbound-initiated conversations

### Future adapters

The `ChannelAdapter` interface is designed so that adding Telegram, Slack, or a web chat widget requires only implementing `parseInbound()` and `sendOutbound()` — no changes to any other tier.

---

## 6. Tier 3 — Session manager

### Responsibility

Manage per-conversation state. Every unique user (phone number) has a session containing: customer identity, auth state, conversation history (for the LLM), active workflow state, and collected data. Sessions persist across server restarts.

### Session structure

```typescript
// konvo/src/session/types.ts

export interface Session {
  id: string                        // "wa_5511999887766"
  channelUserId: string             // raw phone number
  customer: UserIdentity | null     // resolved by auth.resolve()

  // Auth state
  auth: {
    status: 'authenticated' | 'guest' | 'pending' | null
    cachedUntil: number             // timestamp — re-run authenticate() after this
  }
  permissions: UserPermissions      // what tools/workflows this user can access

  // Conversation history — AI SDK CoreMessage[] format
  // Sent to the LLM for context on every turn
  messages: CoreMessage[]

  // Active workflow state
  workflow: {
    name: string | null             // "rescheduleAppointment" or null
    currentStep: string | null      // "pickSlot"
    collectedData: Record<string, any>  // data gathered across steps
    pendingConfirmation: string | null  // step waiting for user response
  }

  // Metadata
  createdAt: Date
  lastMessageAt: Date
  messageCount: number
}
```

### SessionStore interface

```typescript
// konvo/src/session/stores/interface.ts

export interface SessionStore {
  get(sessionId: string): Promise<Session | null>
  set(sessionId: string, session: Session): Promise<void>
  delete(sessionId: string): Promise<void>
  cleanup?(olderThan: Date): Promise<number>
}
```

### Store implementations

**MemoryStore** — default for development. Emits a console warning on startup: "⚠️ Using in-memory session store. Sessions will be lost on restart."

**SQLiteStore** — recommended for production. Zero infrastructure, file-based, persists across restarts. Uses `better-sqlite3` for synchronous, fast reads/writes. Supports TTL with periodic cleanup.

```typescript
// SQLite schema
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,               -- JSON serialized session
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_last_message ON sessions(last_message_at);
```

**RedisStore** — for multi-instance deployments behind a load balancer. Uses `ioredis`. Sets Redis TTL on every write so keys auto-expire.

### Conversation history management

The conversation history (`messages[]`) is bounded by a sliding window to keep sessions small and within LLM context limits:

- Default: keep last 20 messages (~10 exchanges)
- Always preserves the first message (often contains the initial intent)
- Trims from the front when the limit is exceeded
- Typical session size: 5-15 KB — safe to serialize on every message

**Future (v2):** Summary compaction — when history exceeds a threshold, use the LLM to summarize older messages into a single system message, preserving key facts while reducing token count.

### Session TTL

Sessions auto-expire after a configurable period of inactivity (default: 24 hours). In Redis, this is handled by Redis TTL. In SQLite, a cleanup function runs periodically.

---

## 7. Tier 4 — Agent core

### Responsibility

The brain of the framework. Receives normalized messages with session context, decides what to do (intent routing), executes tools through AI SDK, manages workflow progression, and produces outbound messages.

### Central message processor

```typescript
// konvo/src/core/processor.ts

async function processMessage(inbound: InboundMessage, config: KonvoConfig) {
  // 1. Load session
  const session = await config.store.getOrCreate(inbound.channelUserId)

  // 2. Auth gate (identify → authenticate → authorize)
  const authResult = await runAuthGate(session, inbound, config)
  if (authResult.blocked) return

  // 3. Route based on session state
  if (session.workflow.pendingConfirmation) {
    return await handleWorkflowResponse(session, inbound, config)
  }
  if (session.workflow.name) {
    return await continueWorkflow(session, inbound, config)
  }
  return await routeNewMessage(session, inbound, config)
}
```

### Router agent

When no workflow is active, the router uses AI SDK `generateText()` with all allowed tools to let the LLM decide what to do:

```typescript
// konvo/src/core/router.ts
import { generateText } from 'ai'

async function routeNewMessage(session, inbound, config) {
  const allowedTools = filterToolsByPermissions(
    config.toolRegistry.getAll(), session.permissions
  )
  const allowedWorkflows = filterWorkflowsByPermissions(
    config.workflows, session.permissions
  )

  const { text, toolCalls, toolResults } = await generateText({
    model: config.agent.model,
    system: buildSystemPrompt(config, session, allowedWorkflows),
    messages: [
      ...session.messages,
      { role: 'user', content: inbound.content.text }
    ],
    tools: allowedTools,
    maxSteps: config.agent.maxSteps ?? 5,
    onStepFinish: async ({ toolCalls, toolResults }) => {
      // Audit logging for every tool execution
      for (const call of toolCalls) {
        await config.audit?.log({
          sessionId: session.id,
          tool: call.toolName,
          input: call.args,
          timestamp: new Date(),
        })
      }
    }
  })

  // Update session and send response
  session.messages.push({ role: 'user', content: inbound.content.text })
  session.messages.push({ role: 'assistant', content: text })
  await config.store.set(session.id, session)
  await config.channelAdapter.sendOutbound(session.channelUserId, { type: 'text', text })
}
```

### System prompt construction

The system prompt is dynamically built per conversation:

```typescript
// konvo/src/core/prompts.ts

function buildSystemPrompt(config, session, allowedWorkflows): string {
  const parts = []

  // 1. Agent personality (user-defined)
  parts.push(config.agent.instructions)

  // 2. Customer context (if identified)
  if (session.customer) {
    parts.push(`Current customer: ${session.customer.name} (ID: ${session.customer.id})`)
  }

  // 3. Available workflows (only those this user has permission for)
  for (const wf of allowedWorkflows) {
    parts.push(`Workflow "${wf.name}": ${wf.trigger}`)
  }

  // 4. Safety rules (always present)
  parts.push(`RULES:
- Never execute destructive actions without explicit user confirmation.
- If unsure about user intent, ask for clarification.
- If you cannot help, offer to connect with a human.
- Never reveal internal tool names or system architecture.
- Respond in the language the user writes in.`)

  return parts.join('\n\n')
}
```

### Workflow executor

The workflow engine processes declarative step definitions, managing conversation turns and API calls:

```typescript
// konvo/src/core/workflow-executor.ts

async function executeStep(session, workflow, step, config) {
  switch (step.type) {
    case 'tool': {
      const tool = config.toolRegistry.get(step.tool)
      const input = step.input(session.workflow)
      await config.safety.checkBeforeExecution(tool, input, session)
      const result = await tool.execute(input)
      session.workflow.collectedData[step.name] = result
      // Advance to next step or end workflow
      break
    }
    case 'ask_user': {
      // Send message and wait for response (set pendingConfirmation)
      const message = typeof step.message === 'function'
        ? step.message(session.workflow) : step.message
      session.workflow.pendingConfirmation = step.name
      if (step.options) {
        await config.channelAdapter.sendOutbound(session.channelUserId, {
          type: 'options', text: message, options: step.options(session.workflow)
        })
      } else {
        await config.channelAdapter.sendOutbound(session.channelUserId, {
          type: 'text', text: message
        })
      }
      break
    }
    case 'confirmation': {
      session.workflow.pendingConfirmation = step.name
      await config.channelAdapter.sendOutbound(session.channelUserId, {
        type: 'confirmation',
        text: typeof step.message === 'function'
          ? step.message(session.workflow) : step.message,
        confirmLabel: step.confirmLabel,
        cancelLabel: step.cancelLabel,
      })
      break
    }
  }
  await config.store.set(session.id, session)
}
```

### Safety middleware

Every tool execution passes through the safety layer:

```typescript
// konvo/src/safety/middleware.ts

export function wrapToolsWithSafety(tools, safetyConfig) {
  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => [
      name,
      {
        ...t,
        execute: async (args) => {
          // 1. Rate limit check
          checkRateLimit(safetyConfig.rateLimit, session)

          // 2. Action level classification
          const level = safetyConfig.actionLevels?.[name] ?? 'read'

          // 3. Confirmation requirement
          if (level === 'destructive' && safetyConfig.rules?.destructive?.requireConfirmation) {
            // The workflow engine handles this — tool-level safety
            // just prevents direct execution without prior confirmation step
          }

          // 4. Execute
          const result = await t.execute(args)

          // 5. Audit log
          await safetyConfig.audit?.log({ tool: name, input: args, result, timestamp: new Date() })

          return result
        }
      }
    ])
  )
}
```

---

## 8. Tier 5 — Tool registry

### Responsibility

Store and manage all available tools. Provide the `defineTool()` helper for manual tool creation. Generate tools from OpenAPI specs. Handle authenticated HTTP calls to the user's API.

### Manual tool definition (primary path)

```typescript
// Public API: konvo/src/tools/define-tool.ts
import { tool } from 'ai'
import { z } from 'zod'

export function defineTool<T extends z.ZodType>(config: {
  name: string
  description: string          // LLM-optimized: "Use when..." not "Retrieves..."
  parameters: T
  execute: (args: z.infer<T>) => Promise<any>
  formatResponse?: (result: any) => string
  actionLevel?: 'read' | 'write' | 'destructive'
}) {
  return {
    ...tool({
      description: config.description,
      inputSchema: config.parameters,
      execute: config.execute,
    }),
    name: config.name,
    actionLevel: config.actionLevel ?? 'read',
    formatResponse: config.formatResponse,
  }
}
```

### OpenAPI spec auto-generation

For APIs with an OpenAPI spec, the framework generates tool definitions automatically:

```typescript
// Internal: konvo/src/tools/openapi-generator.ts

export async function generateToolsFromSpec(specPath: string, apiConfig: ApiConfig) {
  const spec = await parseOpenAPISpec(specPath)
  const tools = {}

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const operationId = operation.operationId
      if (!operationId) continue

      const zodSchema = openApiParamsToZod(operation.parameters, operation.requestBody)

      tools[operationId] = defineTool({
        name: operationId,
        description: rewriteForLLM(operation.summary, operation.description, method, path),
        parameters: zodSchema,
        actionLevel: inferActionLevel(method), // GET→read, POST/PUT→write, DELETE→destructive
        execute: async (args) => {
          const url = buildUrl(apiConfig.baseUrl, path, args)
          const response = await fetch(url, {
            method: method.toUpperCase(),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiConfig.token}`,
              ...apiConfig.headers,
            },
            body: method !== 'get' ? JSON.stringify(extractBody(args, operation)) : undefined,
          })
          if (!response.ok) throw new ToolExecutionError(response.status, await response.text())
          return await response.json()
        }
      })
    }
  }
  return tools
}
```

### HTTP client layer

When tools call the user's API, they use the framework's HTTP client which handles auth injection, error normalization, and retry logic:

```typescript
// Internal: konvo/src/tools/http-client.ts

export function createApiClient(config: ApiConfig) {
  return async function apiCall(method: string, path: string, params?: any) {
    const url = new URL(path, config.baseUrl)
    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
        ...config.headers,
      },
      body: params ? JSON.stringify(params) : undefined,
    })

    if (!response.ok) {
      throw new ToolExecutionError(
        `API error ${response.status}: ${await response.text()}`
      )
    }

    return response.json()
  }
}
```

---

## 9. Authentication and authorization

### Three-step auth pipeline

Authentication runs as a gate before any agent logic. It consists of three optional steps:

1. **Identify** — `resolve(phoneNumber)` → who is this person?
2. **Authenticate** — `authenticate(user, phone)` → are they allowed in?
3. **Authorize** — `authorize(user)` → what can they do?

### Auth config

```typescript
auth: {
  // Step 1: Identify
  resolve: async (phoneNumber: string): Promise<UserIdentity | null> => {
    const customer = await clinicApi.getCustomerByPhone(phoneNumber)
    if (!customer) return null
    return { id: customer.id, name: customer.name, phone: phoneNumber, metadata: {} }
  },

  // Step 2: Authenticate
  authenticate: async (user: UserIdentity | null, phone: string): Promise<AuthResult> => {
    if (!user) return { status: 'denied', reason: 'not_registered' }
    if (user.metadata.plan === 'cancelled') return { status: 'denied', reason: 'account_inactive' }
    return { status: 'authenticated' }
  },

  // Step 3: Authorize
  authorize: async (user: UserIdentity): Promise<UserPermissions> => {
    return {
      role: 'patient',
      allowedTools: ['listAppointments', 'checkAvailability', 'createAppointment'],
      allowedWorkflows: ['newBooking', 'rescheduleAppointment'],
    }
  },

  // Denial handlers
  onUnauthenticated: {
    'not_registered': {
      message: 'I can only help registered patients. Register at clinicabella.com/register',
      fallbackPermissions: {  // optional: guest mode with limited access
        role: 'guest',
        allowedTools: ['getServices', 'checkAvailability'],
        allowedWorkflows: [],
      }
    },
    'account_inactive': {
      message: 'Your account is no longer active. Contact us at (11) 99999-9999.',
    },
    default: { message: 'Access denied.' }
  },

  // Cache auth result to avoid re-authenticating every message
  cacheFor: 3600,  // seconds (1 hour)
}
```

### Types

```typescript
export interface UserIdentity {
  id: string
  name: string
  phone: string
  metadata: Record<string, any>
}

export type AuthResult =
  | { status: 'authenticated' }
  | { status: 'denied'; reason: string }

export interface UserPermissions {
  role: string
  allowedTools: string[] | '*'
  allowedWorkflows: string[] | '*'
  metadata?: Record<string, any>
}
```

### How permissions filter the agent

Permissions don't just live in the session — they control what the LLM sees. When `allowedTools` is a list, the `generateText()` call only receives those tools. The LLM literally cannot call a tool the user doesn't have permission for, because it doesn't know it exists. This is more secure than post-hoc blocking.

---

## 10. Workflow system

### Declarative workflow definition

```typescript
import { defineWorkflow, step } from 'konvo'

export const rescheduleWorkflow = defineWorkflow({
  name: 'rescheduleAppointment',
  trigger: 'User wants to change the date/time of an existing appointment',

  steps: [
    step('findAppointment', {
      tool: 'listAppointments',
      input: (ctx) => ({ customerId: ctx.customer.id, status: 'upcoming' }),
      onMultipleResults: 'ask_user_to_pick',
    }),
    step('getNewDate', {
      type: 'ask_user',
      message: 'When would you like to reschedule to?',
      parseAs: 'date',
    }),
    step('checkSlots', {
      tool: 'checkAvailability',
      input: (ctx) => ({
        date: ctx.steps.getNewDate.value,
        serviceId: ctx.steps.findAppointment.result.serviceId
      }),
      onEmptyResult: {
        message: 'No availability on that date. Want me to check nearby dates?',
        fallback: 'suggestAlternativeDates'
      }
    }),
    step('pickSlot', {
      type: 'ask_user',
      message: 'Available slots:',
      options: (ctx) => ctx.steps.checkSlots.result.map(s => ({
        id: s.slotId, label: `${s.time} — ${s.provider}`
      })),
    }),
    step('confirm', {
      type: 'confirmation',
      message: (ctx) =>
        `Reschedule to ${ctx.steps.pickSlot.selected.label}?`,
    }),
    step('execute', {
      tool: 'rescheduleAppointment',
      input: (ctx) => ({
        appointmentId: ctx.steps.findAppointment.result.id,
        newSlotId: ctx.steps.pickSlot.selected.id
      }),
      onSuccess: 'Appointment rescheduled successfully!',
      onError: 'Something went wrong. Let me connect you to the clinic.',
    }),
  ],

  // Workflow-level behaviors
  timeout: { minutes: 30, message: 'Still there? We can pick up where we left off.' },
  offTopic: 'pause_and_address',
  onError: 'apologize_and_escalate',
})
```

### Step types

| Type | Behavior |
|---|---|
| `tool` | Execute an API tool with input derived from collected data |
| `ask_user` | Send a message and wait for the user's free-text or selection response |
| `confirmation` | Send a yes/no prompt and wait (rendered as buttons on WhatsApp) |

---

## 11. NPM package structure

```
konvo/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                        # Public API exports
│   ├── core/
│   │   ├── konvo.ts             # Main Konvo class
│   │   ├── processor.ts                # Central message dispatch
│   │   ├── router.ts                   # LLM-based intent routing
│   │   ├── workflow-executor.ts        # Workflow step engine
│   │   └── prompts.ts                  # System prompt builder
│   ├── tools/
│   │   ├── registry.ts                 # Tool storage + lookup
│   │   ├── define-tool.ts              # defineTool() public helper
│   │   ├── openapi-generator.ts        # OpenAPI → tool definitions
│   │   └── http-client.ts             # Authenticated API client
│   ├── session/
│   │   ├── manager.ts                  # Session lifecycle
│   │   ├── types.ts                    # Session types
│   │   └── stores/
│   │       ├── interface.ts            # SessionStore interface
│   │       ├── memory.ts              # In-memory (dev default)
│   │       └── sqlite.ts             # SQLite (production default)
│   ├── channels/
│   │   ├── interface.ts                # ChannelAdapter interface
│   │   └── whatsapp/
│   │       ├── adapter.ts              # WhatsApp Cloud API adapter
│   │       ├── message-builders.ts     # Interactive list, buttons, templates
│   │       └── types.ts
│   ├── auth/
│   │   ├── gate.ts                     # Auth pipeline runner
│   │   └── types.ts                    # AuthResult, UserPermissions, etc.
│   ├── safety/
│   │   ├── middleware.ts               # Tool execution wrapper
│   │   ├── guards.ts                   # Confirmation, rate limiting
│   │   └── audit.ts                    # Action logging
│   ├── server/
│   │   ├── hono-server.ts             # HTTP server factory
│   │   └── middleware/
│   │       └── security.ts            # Webhook signature verification
│   └── types/
│       ├── config.ts                   # KonvoConfig
│       ├── messages.ts                 # InboundMessage, OutboundMessage
│       └── workflow.ts                 # Workflow, Step definitions
├── dist/                               # Compiled output (ESM)
└── examples/
    └── clinic-bot/                     # Working example
```

### Package exports

```json
{
  "name": "konvo",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./channels/whatsapp": "./dist/channels/whatsapp/adapter.js",
    "./stores/sqlite": "./dist/session/stores/sqlite.js",
    "./stores/redis": "./dist/session/stores/redis.js"
  },
  "peerDependencies": {
    "ai": "^6.0.0",
    "zod": "^3.23.0"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "whatsapp-api-js": "^5.0.0",
    "better-sqlite3": "^11.0.0"
  },
  "optionalDependencies": {
    "ioredis": "^5.0.0"
  }
}
```

### Public API surface

```typescript
// What the user imports from 'konvo':

export { Konvo } from './core/konvo'
export { defineTool } from './tools/define-tool'
export { defineWorkflow, step } from './types/workflow'

// Types
export type { KonvoConfig } from './types/config'
export type { InboundMessage, OutboundMessage } from './types/messages'
export type { Session, SessionStore } from './session/types'
export type { ChannelAdapter } from './channels/interface'
export type { UserIdentity, AuthResult, UserPermissions } from './auth/types'
```

---

## 12. Developer experience — how users interact with the framework

### Minimal example (simplest possible usage)

```typescript
import { Konvo, defineTool } from 'konvo'
import { whatsapp } from 'konvo/channels/whatsapp'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const checkStatus = defineTool({
  name: 'checkOrderStatus',
  description: 'Use when the user asks about their order status.',
  parameters: z.object({ orderId: z.string() }),
  execute: async ({ orderId }) => {
    const res = await fetch(`https://my-api.com/orders/${orderId}`)
    return res.json()
  },
})

const agent = new Konvo({
  agent: {
    model: openai('gpt-4o-mini'),
    instructions: 'You are a helpful order tracking assistant.',
  },
  tools: [checkStatus],
  channel: whatsapp({
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID!,
    accessToken: process.env.WA_ACCESS_TOKEN!,
    verifyToken: process.env.WA_VERIFY_TOKEN!,
    appSecret: process.env.WA_APP_SECRET!,
  }),
})

agent.listen(3000)
```

### Full example (clinic bot with auth, workflows, safety)

```typescript
import { Konvo, defineTool, defineWorkflow, step } from 'konvo'
import { whatsapp } from 'konvo/channels/whatsapp'
import { SQLiteStore } from 'konvo/stores/sqlite'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

// --- Tools ---
const listAppointments = defineTool({
  name: 'listAppointments',
  description: 'Use when the user wants to see their upcoming appointments.',
  parameters: z.object({
    customerId: z.string(),
    status: z.enum(['upcoming', 'past', 'cancelled']).optional(),
  }),
  execute: async ({ customerId, status }) => {
    const res = await fetch(`https://clinic-api.com/appointments?customer=${customerId}&status=${status ?? 'upcoming'}`, {
      headers: { Authorization: `Bearer ${process.env.CLINIC_API_KEY}` },
    })
    return res.json()
  },
  actionLevel: 'read',
})

// ... more tools: checkAvailability, createAppointment, rescheduleAppointment, cancelAppointment

// --- Workflows ---
const rescheduleWorkflow = defineWorkflow({
  name: 'rescheduleAppointment',
  trigger: 'User wants to change the date/time of an existing appointment',
  steps: [
    step('findAppointment', { tool: 'listAppointments', input: (ctx) => ({ customerId: ctx.customer.id }) }),
    step('getNewDate', { type: 'ask_user', message: 'When would you like to reschedule to?', parseAs: 'date' }),
    step('checkSlots', { tool: 'checkAvailability', input: (ctx) => ({ date: ctx.steps.getNewDate.value }) }),
    step('pickSlot', { type: 'ask_user', message: 'Available slots:', options: (ctx) => ctx.steps.checkSlots.result.map(s => ({ id: s.id, label: `${s.time} — ${s.provider}` })) }),
    step('confirm', { type: 'confirmation', message: (ctx) => `Reschedule to ${ctx.steps.pickSlot.selected.label}?` }),
    step('execute', { tool: 'rescheduleAppointment', input: (ctx) => ({ appointmentId: ctx.steps.findAppointment.result.id, newSlotId: ctx.steps.pickSlot.selected.id }), onSuccess: 'Rescheduled successfully!' }),
  ],
})

// --- Agent ---
const agent = new Konvo({
  agent: {
    model: openai('gpt-4o-mini'),
    instructions: 'You are a friendly assistant for Clínica Bella. Be concise. Use pt-BR.',
    maxSteps: 5,
  },
  tools: [listAppointments, /* ...more */],
  workflows: [rescheduleWorkflow, /* ...more */],
  store: new SQLiteStore({ path: './data/sessions.db', ttl: 86400 }),
  auth: {
    resolve: async (phone) => {
      const c = await clinicApi.getCustomerByPhone(phone)
      return c ? { id: c.id, name: c.name, phone, metadata: { role: c.role } } : null
    },
    authenticate: async (user) => user ? { status: 'authenticated' } : { status: 'denied', reason: 'not_registered' },
    authorize: async (user) => ({
      role: user.metadata.role,
      allowedTools: user.metadata.role === 'patient'
        ? ['listAppointments', 'checkAvailability', 'createAppointment', 'rescheduleAppointment']
        : '*',
      allowedWorkflows: user.metadata.role === 'patient'
        ? ['newBooking', 'rescheduleAppointment']
        : '*',
    }),
    onUnauthenticated: {
      not_registered: { message: 'Only registered patients can use this. Visit clinicabella.com/register' },
      default: { message: 'Access denied.' },
    },
    cacheFor: 3600,
  },
  safety: {
    actionLevels: {
      read: ['listAppointments', 'checkAvailability', 'getServices'],
      write: ['createAppointment', 'rescheduleAppointment'],
      destructive: ['cancelAppointment'],
    },
    rules: {
      read: { requireConfirmation: false },
      write: { requireConfirmation: true },
      destructive: { requireConfirmation: true, cooldownSeconds: 5 },
    },
    rateLimit: { maxActionsPerMinute: 5, maxActionsPerHour: 50 },
  },
  channel: whatsapp({
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID!,
    accessToken: process.env.WA_ACCESS_TOKEN!,
    verifyToken: process.env.WA_VERIFY_TOKEN!,
    appSecret: process.env.WA_APP_SECRET!,
  }),
})

agent.listen(3000)
```

---

## 13. Development phases

### Phase 1 — Core MVP (showcasable) — 2-3 weeks

**Goal:** A working framework that can be demonstrated in an interview or README. One polished example (clinic bot). Published to npm.

**What's included:**

- `Konvo` main class with `listen()` method
- `defineTool()` helper with Zod schemas (manual tool definition only)
- Sequential workflow engine with `tool`, `ask_user`, and `confirmation` step types
- WhatsApp Cloud API adapter (text, quick reply buttons, interactive lists)
- Session manager with `MemoryStore` (dev) and `SQLiteStore` (production)
- Conversation history with sliding window (bounded messages[])
- Auth gate: `resolve` (identify) + `authenticate` (allow/deny) — no authorize step yet
- `onUnauthenticated` handlers with denial messages
- Safety: action level classification + confirmation for write/destructive actions
- Webhook signature verification
- Hono HTTP server with `/webhook` and `/health` routes
- One working example: clinic bot with fake API (3-4 tools, 1-2 workflows)
- README with architecture diagram, quick start, and full example

**What's explicitly cut from Phase 1:**

- OpenAPI auto-generation (manual tools only)
- `authorize` step with role-based tool filtering (all authenticated users see all tools)
- Redis store
- Rate limiting
- Audit logging
- Telegram/Slack adapters
- Summary compaction
- CLI scaffolding
- Local playground UI

**Why this scope:** The demo flow is: open README → see the code example → see the architecture diagram → clone the repo → run the clinic example → send a WhatsApp message → see the bot reschedule an appointment with confirmation buttons. That's enough to demonstrate system design, AI integration, TypeScript API design, and real-world messaging channel work.

### Phase 2 — Developer experience — 2-3 weeks

**Goal:** Transform from "working code" to "framework developers want to use."

**What's added:**

- CLI scaffolding: `npx create-konvo` with interactive prompts
- Local playground/simulator: React web UI for testing conversations without WhatsApp setup
  - Chat interface simulating WhatsApp
  - Agent reasoning panel (shows tool calls, workflow state, session data)
  - Visual workflow debugger
- `authorize` step with role-based tool/workflow filtering
- OpenAPI spec auto-ingestion (`api: { spec: './openapi.yaml' }`)
- Rate limiting (per-user, configurable)
- Audit logging (pluggable: console, file, custom)
- Redis session store for multi-instance deployments
- Improved error messages and config validation
- Documentation website (simple, Markdown-based)

**Why this matters:** The playground is the most impactful feature for demonstrating the project. In an interview, you open a browser and show someone the agent thinking in real time — which tools it considered, the workflow state transitions, the session being persisted. This is also what separates "I built a bot" from "I built a framework for building bots."

### Phase 3 — Production features — ongoing

**What's added:**

- Telegram adapter
- Web chat adapter (WebSocket-based, for embedding in websites)
- MCP server export (expose Konvo agents as MCP tools)
- Summary compaction for long conversations
- Message templates for outbound-initiated conversations (WhatsApp requirement)
- Conversation analytics (response times, tool usage, escalation rates)
- Pre-built recipe templates (clinic, e-commerce, restaurant)
- Human handoff with webhook notifications
- Retry logic for failed tool executions
- Multi-language support with automatic language detection
- Voice message transcription (WhatsApp audio → text via Whisper API)

---

## 14. Example: Clinic bot (Phase 1 deliverable)

The clinic bot is the primary showcase example. It demonstrates:

- 4 tools connected to a mock API (list appointments, check availability, create booking, reschedule)
- 2 workflows (new booking, reschedule appointment)
- Auth: only registered patients (by phone number) can interact
- Safety: booking requires confirmation, rescheduling requires confirmation
- WhatsApp UX: interactive lists for time slot selection, quick reply buttons for confirmations
- SQLite persistence: conversations survive server restarts

### Mock API

The example includes a simple Hono server acting as the clinic API, with in-memory data for appointments, services, and customers. This lets anyone clone the repo and run the full demo without external dependencies.

### Demo conversation flow

```
User: "Oi, quero agendar uma consulta"
Bot:  "Olá Maria! Qual procedimento você gostaria de agendar?"
      [Interactive list: Limpeza de Pele, Peeling, Botox, Preenchimento]

User: [Taps "Limpeza de Pele"]
Bot:  "Ótimo! Para qual dia?"

User: "Próxima terça"
Bot:  "Horários disponíveis para terça, 15/04:"
      [Interactive list: 10:00 — Dra. Ana, 14:00 — Dra. Ana, 16:00 — Dr. Carlos]

User: [Taps "14:00 — Dra. Ana"]
Bot:  "Confirma o agendamento?
       📅 Limpeza de Pele
       📆 15/04/2026 às 14:00
       👩‍⚕️ Dra. Ana"
      [Buttons: ✅ Confirmar | ❌ Cancelar]

User: [Taps "✅ Confirmar"]
Bot:  "Consulta agendada com sucesso! Até terça, Maria 😊"
```

---

## 15. Success metrics

### As a portfolio project

- Clean, well-documented GitHub repository with architecture diagrams
- Working demo that can be shown in under 5 minutes
- Published npm package with sensible defaults and good DX
- README that tells a clear story: problem → solution → quick start → architecture
- Local playground that visually demonstrates agent reasoning

### As an open-source project (stretch)

- Stars and forks on GitHub
- npm weekly downloads
- Community-built channel adapters or session stores
- Real-world usage by at least one business (the clinic is the first candidate)

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| **Tool** | A function the LLM can call, backed by an API endpoint or custom logic |
| **Workflow** | A multi-step conversation flow with defined steps, data collection, and confirmations |
| **Session** | Per-user conversation state, persisted across messages and server restarts |
| **Channel adapter** | Translates between a messaging platform's format and the framework's normalized messages |
| **Auth gate** | The identify → authenticate → authorize pipeline that runs before agent logic |
| **Action level** | Classification of a tool as read, write, or destructive (determines confirmation requirements) |
| **Sliding window** | Keeps conversation history bounded by discarding oldest messages beyond a limit |

## Appendix B: Environment variables (WhatsApp setup)

```env
# WhatsApp Cloud API credentials (from Meta Developer Portal)
WA_PHONE_NUMBER_ID=your_phone_number_id
WA_ACCESS_TOKEN=your_permanent_access_token
WA_VERIFY_TOKEN=your_custom_webhook_verify_string
WA_APP_SECRET=your_meta_app_secret

# User's API (the business application being connected)
API_BASE_URL=https://your-api.com
API_TOKEN=your_api_bearer_token

# LLM provider
OPENAI_API_KEY=sk-...
# or ANTHROPIC_API_KEY=sk-ant-...
```