# konvo

**Build Meta-compliant WhatsApp AI agents in 100 lines of TypeScript.**

Konvo is an open-source framework that connects any REST API to a conversational AI agent on WhatsApp. Define your tools, compose workflows, configure auth — the framework handles LLM orchestration, session management, channel rendering, and webhook compliance.

```typescript
import { Konvo, defineTool } from 'konvo'
import { whatsapp } from 'konvo/channels/whatsapp'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const checkStatus = defineTool({
  name: 'checkOrderStatus',
  description: 'Use when the user asks about their order status.',
  parameters: z.object({ orderId: z.string() }),
  execute: async ({ orderId }) => fetchOrderFromYourAPI(orderId),
})

const agent = new Konvo({
  agent: { model: openai('gpt-4o-mini'), instructions: 'You are a helpful order support assistant.' },
  channel: whatsapp({ phoneNumberId, accessToken, verifyToken, appSecret }),
  tools: [checkStatus],
  webhook: { verifyToken, appSecret },
})

await agent.listen(3000)
```

---

## Why Konvo?

WhatsApp has 3+ billion active users. 175 million people message a WhatsApp Business account every day. As of January 2026, Meta explicitly encourages task-oriented bots for bookings, support, and order tracking.

The existing options are:

| Option | Problem |
|--------|---------|
| Vercel AI SDK / Mastra | Build everything yourself: channel adapters, workflows, auth, session state |
| respond.io / Wassenger | Proprietary SaaS, no code ownership, per-message pricing |
| OpenAPI-to-MCP tools | 1:1 endpoint mapping — no conversation orchestration |

Konvo owns the layer between your API and the conversation interface.

---

## Installation

```bash
npm install konvo
# konvo has peer dependencies:
npm install ai zod
# For WhatsApp:
npm install @ai-sdk/openai  # or any AI SDK provider
```

---

## Quick start

### 1. Define tools

Tools are the actions your agent can take. Use `defineTool()` to connect your API endpoints:

```typescript
import { defineTool } from 'konvo'
import { z } from 'zod'

const getAvailableSlots = defineTool({
  name: 'getAvailableSlots',
  description: 'Use when the user asks what appointment times are available.',
  parameters: z.object({ date: z.string().describe('Date in YYYY-MM-DD format') }),
  execute: async ({ date }) => {
    const res = await fetch(`https://my-api.com/slots?date=${date}`)
    return res.json()
  },
})

const bookAppointment = defineTool({
  name: 'bookAppointment',
  description: 'Use when the user confirms they want to book a specific slot.',
  actionLevel: 'write',  // requires user confirmation before executing
  parameters: z.object({
    date: z.string(),
    slotId: z.string(),
    patientId: z.string(),
  }),
  execute: async (args) => {
    const res = await fetch('https://my-api.com/appointments', {
      method: 'POST',
      body: JSON.stringify(args),
    })
    return res.json()
  },
})
```

### 2. Define workflows (optional)

Workflows are structured multi-step flows that collect data, present interactive buttons, confirm with the user, and execute actions — without relying on the LLM to manage state:

```typescript
import { defineWorkflow, step } from 'konvo'

const bookingWorkflow = defineWorkflow({
  name: 'newBooking',
  trigger: 'User wants to book or schedule an appointment',
  steps: [
    step('askDate', {
      type: 'ask_user',
      message: 'What date would you like? (e.g. 2026-05-10)',
    }),
    step('getSlots', {
      type: 'tool',
      tool: 'getAvailableSlots',
      input: (ctx) => ({ date: ctx.collectedData.askDate as string }),
    }),
    step('pickSlot', {
      type: 'ask_user',
      message: 'Choose a time:',
      options: (ctx) => {
        const slots = (ctx.collectedData.getSlots as { availableSlots: Array<{ slotId: string; time: string }> }).availableSlots
        return slots.map((s) => ({ id: s.slotId, label: s.time }))
      },
    }),
    step('confirm', {
      type: 'confirmation',
      message: (ctx) => `Book on ${ctx.collectedData.askDate as string}?`,
    }),
    step('createBooking', {
      type: 'tool',
      tool: 'bookAppointment',
      input: (ctx) => ({
        date: ctx.collectedData.askDate as string,
        slotId: ctx.collectedData.pickSlot as string,
        patientId: ctx.customer?.id ?? '',
      }),
      onSuccess: 'Your appointment is confirmed!',
    }),
  ],
})
```

### 3. Configure auth (optional)

Identify users by phone number and control access:

```typescript
const agent = new Konvo({
  // ...
  auth: {
    resolve: async (phone) => {
      const user = await db.users.findByPhone(phone)
      return user ? { id: user.id, name: user.name, phone, metadata: {} } : null
    },
    authenticate: async (user) => {
      if (user) return { status: 'authenticated' }
      return { status: 'denied', reason: 'not_registered' }
    },
    onUnauthenticated: {
      not_registered: {
        message: 'Please register at our website first to use this service.',
      },
    },
  },
})
```

### 4. Choose a session store

```typescript
import { SQLiteStore } from 'konvo/stores/sqlite'

const agent = new Konvo({
  // ...
  store: new SQLiteStore({ path: './sessions.db' }),  // production
  // store omitted → MemoryStore (dev only, data lost on restart)
})
```

---

## Architecture

```
WhatsApp User
      │
      ▼ HTTP POST /webhook
┌──────────────────────────────────────────────────────────┐
│  Tier 1: HTTP layer (Hono)                               │
│  • HMAC-SHA256 signature verification                    │
│  • Hub verification (GET /webhook)                       │
│  • Fire-and-forget message dispatch                      │
├──────────────────────────────────────────────────────────┤
│  Tier 2: Channel adapter                                 │
│  • Normalizes WhatsApp payloads → InboundMessage         │
│  • Renders OutboundMessage → buttons/lists/text          │
├──────────────────────────────────────────────────────────┤
│  Tier 3: Session manager                                 │
│  • Per-user session: history, workflow state, auth cache │
│  • Pluggable store: MemoryStore / SQLiteStore            │
├──────────────────────────────────────────────────────────┤
│  Tier 4: Agent core                                      │
│  • Auth gate: identify → authenticate → authorize        │
│  • Router: LLM picks tool or workflow                    │
│  • Workflow executor: step-by-step with state            │
│  • Safety: action levels, rate limiting                  │
├──────────────────────────────────────────────────────────┤
│  Tier 5: Tool registry                                   │
│  • defineTool() with Zod schemas                         │
│  • Permission-filtered execution                         │
└──────────────────────────────────────────────────────────┘
      │
      ▼ fetch()
Your REST API
```

---

## API Reference

### `defineTool(config)`

Define a tool the agent can call.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✓ | Unique tool name |
| `description` | `string` | ✓ | LLM-facing description. Write as "Use when..." |
| `parameters` | `ZodType` | ✓ | Input schema. The LLM generates arguments from this. |
| `execute` | `(args) => Promise<unknown>` | ✓ | Your API call |
| `actionLevel` | `'read' \| 'write' \| 'destructive'` | | Safety level. Default: `'read'` |
| `formatResponse` | `(result) => string` | | Format the result for display |

**Action levels:**
- `'read'` — executes immediately
- `'write'` — modifies data, may require user confirmation
- `'destructive'` — irreversible, always requires confirmation

### `defineWorkflow(config)` + `step(name, config)`

Define a multi-step conversation flow.

**Workflow fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Unique workflow name |
| `trigger` | `string` | Natural language description (used in system prompt for routing) |
| `steps` | `WorkflowStep[]` | Ordered steps |

**Step types:**

```typescript
// Collect free-text or selection input
step('collect', {
  type: 'ask_user',
  message: 'What is your order number?',  // or: (ctx) => `Hi ${ctx.customer?.name}!`
  options: (ctx) => [...],  // optional — renders as buttons/list
})

// Execute an API tool
step('fetch', {
  type: 'tool',
  tool: 'toolName',
  input: (ctx) => ({ key: ctx.collectedData.collect as string }),
  onSuccess: 'Done!',
  onError: 'Something went wrong.',
  onEmptyResult: { message: 'No results found.', fallback: 'Try again?' },
})

// Yes/No confirmation
step('confirm', {
  type: 'confirmation',
  message: (ctx) => `Confirm action?`,
  confirmLabel: 'Yes',   // default: 'Yes'
  cancelLabel: 'Cancel', // default: 'No'
})
```

Inside step callbacks, `ctx` provides:
- `ctx.collectedData` — all data collected so far, keyed by step name
- `ctx.customer` — resolved `UserIdentity` (if auth configured)

### `new Konvo(config)`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent.model` | `LanguageModel` | ✓ | AI SDK model (e.g. `openai('gpt-4o-mini')`) |
| `agent.instructions` | `string` | ✓ | System prompt |
| `agent.maxSteps` | `number` | | Max tool-call iterations per turn. Default: `5` |
| `channel` | `ChannelAdapter` | ✓ | Channel adapter (e.g. `whatsapp(...)`) |
| `tools` | `ToolDefinition[]` | ✓ | Use `[]` if no tools |
| `workflows` | `WorkflowDefinition[]` | | Multi-step flows |
| `auth` | `AuthConfig` | | Identity and access control |
| `store` | `SessionStore` | | Defaults to `MemoryStore` |
| `safety` | `SafetyConfig` | | Action levels + rate limiting |
| `historyWindow` | `number` | | Max messages in history. Default: `20` |
| `webhook` | `{ verifyToken, appSecret }` | | Required for `listen()` |

### `agent.listen(port)`

Start the HTTP webhook server. Requires `webhook` in config.

```typescript
await agent.listen(3000)  // logs: [konvo] Listening on http://localhost:3000
await agent.stop()        // graceful shutdown
```

### `whatsapp(config)`

```typescript
import { whatsapp } from 'konvo/channels/whatsapp'

const channel = whatsapp({
  phoneNumberId: '...',  // Meta Developer Portal → WhatsApp → API Setup
  accessToken: '...',    // Permanent access token
  verifyToken: '...',    // Token you set in Meta webhook config
  appSecret: '...',      // App Settings → Basic → App Secret
})
```

### Session stores

```typescript
// Development (in-memory, data lost on restart)
// Default when store is omitted — no import needed

// Production (SQLite, persistent)
import { SQLiteStore } from 'konvo/stores/sqlite'
const store = new SQLiteStore({ path: './sessions.db' })
```

---

## Safety

### Action levels

Declare how sensitive each tool is:

```typescript
defineTool({
  name: 'deleteAccount',
  actionLevel: 'destructive',  // framework sends a confirmation prompt before executing
  // ...
})
```

The framework automatically sends a yes/no confirmation message before executing `write` and `destructive` tools.

Override levels globally in the `safety` config:

```typescript
new Konvo({
  safety: {
    actionLevels: { sendRefund: 'destructive' },  // override without editing the tool
  },
})
```

### Rate limiting

```typescript
import { RateLimiter } from 'konvo'

new Konvo({
  safety: {
    rateLimiter: new RateLimiter(),
    maxCallsPerMinute: 10,
  },
})
```

---

## Error handling

Konvo throws specific error classes you can catch:

```typescript
import { ConfigValidationError, ToolExecutionError, RateLimitError } from 'konvo'

try {
  await agent.listen(3000)
} catch (err) {
  if (err instanceof ConfigValidationError) {
    console.error('Fix your config:', err.message)
  }
}
```

| Error | When |
|-------|------|
| `ConfigValidationError` | Missing or invalid config fields |
| `ToolExecutionError` | Tool `execute()` threw an error |
| `ConfirmationRequiredError` | Tool called without confirmation |
| `RateLimitError` | Session exceeded `maxCallsPerMinute` |
| `WorkflowError` | Workflow step failure |

---

## WhatsApp-specific notes

- **Respond within 20 seconds.** Konvo handles this automatically with fire-and-forget processing.
- **24-hour window.** You can only send free-form messages within 24 hours of the user's last message. After that, you need approved templates.
- **Interactive message limits.** Buttons: max 3. Lists: max 10 rows. Button labels: max 20 characters. Konvo enforces these automatically.
- **Status updates.** Delivery receipts and read receipts are silently ignored by the adapter.

---

## Example: Clinic appointment bot

See [`examples/clinic-bot/`](./examples/clinic-bot/) for a complete example with:
- Appointment booking workflow (date → available slots → pick time → confirm → book)
- Appointment cancellation workflow
- Auth gate that identifies patients by phone number
- Mock clinic REST API

---

## Contributing

Contributions are welcome. Please open an issue before submitting a PR for significant changes.

```bash
git clone https://github.com/NickSant/konvo
cd konvo
pnpm install
pnpm test         # run tests
pnpm typecheck    # type-check
pnpm lint         # lint + format check
```

---

## License

MIT
