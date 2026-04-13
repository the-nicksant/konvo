# CLAUDE.md

> Implementation guidelines for building this project. Read `SPEC.md` first for full architecture and design decisions.

---

## Project overview

This is **an open-source TypeScript framework** that lets developers connect any REST API to a conversational AI agent exposed through messaging channels (primarily WhatsApp). See `SPEC.md` for complete architecture, data flow, and feature specifications.

The framework ships as an npm package. Developers install it, define their API tools, compose conversation workflows, configure auth and safety, and the framework handles LLM orchestration, session persistence, channel-specific UX, and compliance.

### Name

**konvo** — short for "conversation." International, clean, works in any language. The npm package is `konvo`.

---

## Tech stack

| Tool | Version | Purpose |
|---|---|---|
| TypeScript | 5.5+ | Language |
| Node.js | 20+ | Runtime (also support Bun) |
| `ai` (Vercel AI SDK) | ^6.0.0 | LLM calls, tool execution, agent loop |
| `zod` | ^3.23.0 | Schema validation |
| `hono` | ^4.0.0 | HTTP server for webhooks |
| `whatsapp-api-js` | ^5.0.0 | WhatsApp Cloud API interaction |
| `better-sqlite3` | ^11.0.0 | Default persistent session store |
| `vitest` | ^3.0.0 | Testing |
| `tsup` | ^8.0.0 | Build/bundle |
| `biome` | ^1.9.0 | Linting and formatting |
| `changesets` | latest | Versioning and changelog |

---

## Project structure

```
<project-root>/
├── CLAUDE.md                           # This file
├── SPEC.md                             # Full architecture and feature spec
├── package.json
├── tsconfig.json
├── tsup.config.ts                      # Build configuration
├── biome.json                          # Linter/formatter config
├── vitest.config.ts
│
├── src/
│   ├── index.ts                        # Public API — all user-facing exports
│   │
│   ├── core/                           # Tier 4: Agent brain
│   │   ├── agent.ts                    # Main class (the thing users instantiate)
│   │   ├── processor.ts                # Central message dispatch
│   │   ├── router.ts                   # LLM-based intent routing
│   │   ├── workflow-executor.ts        # Workflow step execution engine
│   │   └── prompts.ts                  # System prompt builder
│   │
│   ├── tools/                          # Tier 5: Tool registry
│   │   ├── registry.ts                 # Tool storage + lookup
│   │   ├── define-tool.ts              # Public defineTool() helper
│   │   ├── openapi-generator.ts        # OpenAPI spec → tools (Phase 2)
│   │   └── http-client.ts             # Authenticated fetch wrapper
│   │
│   ├── session/                        # Tier 3: Session manager
│   │   ├── manager.ts                  # Session lifecycle + history management
│   │   ├── types.ts                    # Session, WorkflowState types
│   │   └── stores/
│   │       ├── interface.ts            # SessionStore contract
│   │       ├── memory.ts              # In-memory store (dev)
│   │       └── sqlite.ts             # SQLite store (production)
│   │
│   ├── channels/                       # Tier 2: Channel adapters
│   │   ├── interface.ts                # ChannelAdapter contract
│   │   └── whatsapp/
│   │       ├── adapter.ts              # WhatsApp Cloud API adapter
│   │       ├── message-builders.ts     # Interactive list, buttons, templates
│   │       └── types.ts               # WA-specific types
│   │
│   ├── auth/                           # Authentication & authorization
│   │   ├── gate.ts                     # Auth pipeline (identify → authenticate)
│   │   └── types.ts                    # UserIdentity, AuthResult, UserPermissions
│   │
│   ├── safety/                         # Safety middleware
│   │   ├── middleware.ts               # Wraps tool execution with checks
│   │   └── guards.ts                   # Confirmation logic, action levels
│   │
│   ├── server/                         # Tier 1: HTTP layer
│   │   ├── create-server.ts           # Hono app factory
│   │   └── middleware/
│   │       └── verify-signature.ts    # Webhook HMAC verification
│   │
│   └── types/                          # Shared type definitions
│       ├── config.ts                   # Main config type
│       ├── messages.ts                 # InboundMessage, OutboundMessage
│       └── workflow.ts                 # Workflow, Step definitions
│
├── tests/
│   ├── unit/                           # Pure logic, no I/O
│   │   ├── core/
│   │   │   ├── processor.test.ts
│   │   │   ├── router.test.ts
│   │   │   ├── workflow-executor.test.ts
│   │   │   └── prompts.test.ts
│   │   ├── tools/
│   │   │   ├── registry.test.ts
│   │   │   └── define-tool.test.ts
│   │   ├── session/
│   │   │   ├── manager.test.ts
│   │   │   └── stores/
│   │   │       ├── memory.test.ts
│   │   │       └── sqlite.test.ts
│   │   ├── auth/
│   │   │   └── gate.test.ts
│   │   ├── safety/
│   │   │   └── middleware.test.ts
│   │   └── channels/
│   │       └── whatsapp/
│   │           ├── adapter.test.ts
│   │           └── message-builders.test.ts
│   ├── integration/                    # Multiple modules wired together
│   │   ├── full-message-flow.test.ts
│   │   ├── workflow-completion.test.ts
│   │   └── auth-gate.test.ts
│   └── fixtures/                       # Shared test data
│       ├── webhook-payloads.ts         # Real WhatsApp webhook JSON samples
│       ├── sessions.ts                 # Pre-built session objects
│       └── tools.ts                    # Mock tool definitions
│
└── examples/
    └── clinic-bot/
        ├── package.json
        ├── src/
        │   ├── index.ts                # Agent setup and server start
        │   ├── tools.ts                # Clinic-specific tool definitions
        │   ├── workflows.ts            # Booking and reschedule workflows
        │   └── mock-api.ts            # Fake clinic API (Hono server)
        └── README.md
```

---

## Coding principles

### 1. This is a library, not an application

Every decision should be viewed through the lens of "a developer will install this and build on top of it." This means:

- **Minimal dependencies.** Every dependency is a liability for the consumer. Justify each one. Prefer Node.js built-ins over npm packages when reasonable.
- **No side effects on import.** Importing from `konvo` should never start a server, open a connection, or log to console. Side effects only happen when the user explicitly calls `agent.listen()`.
- **No global state.** Multiple `Konvo` instances in the same process must work independently (different configs, different channels, different stores).
- **Peer dependencies for shared packages.** `ai` and `zod` are peer deps because the user's project already has them. Don't bundle duplicates.

### 2. Readable API is the product

The public API surface (`defineTool`, `defineWorkflow`, `step`, `Konvo` constructor) is the most important code in the project. It's what developers will read first, what appears in READMEs, and what determines adoption.

- **Every public function must be understandable without reading the implementation.** The type signature + JSDoc should be sufficient.
- **Config objects over positional arguments.** A function with 5 positional args is unreadable. A config object with named keys is self-documenting.
- **Sensible defaults for everything.** If a config field can have a reasonable default, it must. The user should only configure what's specific to their use case.
- **Error messages must be actionable.** Not "Invalid config" but "Missing required field 'channel.accessToken'. Get this from Meta Developer Portal → WhatsApp → API Setup."

### 3. Types are documentation

```typescript
// BAD: Type tells you nothing
type Config = {
  auth: any
  tools: unknown[]
}

// GOOD: Type is self-documenting
type Config = {
  /** LLM model and personality configuration */
  agent: {
    /** AI SDK model instance. Example: openai('gpt-4o-mini') */
    model: LanguageModel
    /** System prompt for the agent's personality and behavior rules */
    instructions: string
    /** Max tool-calling steps per turn (default: 5) */
    maxSteps?: number
  }
  /** Tools the agent can call. Created with defineTool() */
  tools: ToolDefinition[]
  /** Multi-step conversation flows. Created with defineWorkflow() */
  workflows?: WorkflowDefinition[]
}
```

Rules:
- Every public type must have JSDoc on each field
- Use `@example` tags for non-obvious fields
- Prefer union types over enums (better tree-shaking, easier to extend)
- Use branded types for IDs when confusion is possible (e.g. `SessionId` vs plain `string`)
- Export all types the user might need for their own type annotations

### 4. Dependency injection over hard-coding

Every external concern must be injectable:

```typescript
// BAD: Hard-coded dependency
import { SQLiteStore } from './stores/sqlite'
class Agent {
  private store = new SQLiteStore('./sessions.db')
}

// GOOD: Injected via interface
class Agent {
  constructor(private store: SessionStore) {}
}
```

This applies to: session stores, channel adapters, LLM models, HTTP clients, audit loggers, and the clock (for testing time-dependent behavior).

### 5. Functions over classes (mostly)

Use plain functions and closures for internal logic. Classes are appropriate only for:
- The main `Konvo` entry point (it has lifecycle: construct → configure → listen → stop)
- Session stores (they hold a connection/handle)
- Channel adapters (they hold credentials)

Everything else — processors, routers, prompt builders, validators — should be pure functions that receive their dependencies as arguments. This makes them trivially testable.

```typescript
// BAD: Class with internal state that's hard to test
class WorkflowExecutor {
  private config: Config
  constructor(config: Config) { this.config = config }
  async execute(session: Session, step: Step) { /* uses this.config */ }
}

// GOOD: Pure function, all deps are arguments
async function executeStep(
  session: Session,
  step: Step,
  toolRegistry: ToolRegistry,
  channelAdapter: ChannelAdapter,
  store: SessionStore,
): Promise<void> { /* ... */ }
```

### 6. Errors are part of the API

Define specific error classes for each failure mode. Never throw plain `Error` or string messages.

```typescript
// src/errors.ts

export class KonvoError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'KonvoError'
  }
}

export class ConfigValidationError extends KonvoError {
  constructor(field: string, message: string) {
    super(`Invalid config field '${field}': ${message}`, 'CONFIG_INVALID')
  }
}

export class ToolExecutionError extends KonvoError {
  constructor(toolName: string, cause: unknown) {
    super(`Tool '${toolName}' failed: ${cause}`, 'TOOL_EXECUTION_FAILED')
  }
}

export class AuthDeniedError extends KonvoError {
  constructor(reason: string) {
    super(`Authentication denied: ${reason}`, 'AUTH_DENIED')
  }
}

export class SessionNotFoundError extends KonvoError {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' not found`, 'SESSION_NOT_FOUND')
  }
}

export class WorkflowError extends KonvoError {
  constructor(workflowName: string, step: string, message: string) {
    super(`Workflow '${workflowName}' at step '${step}': ${message}`, 'WORKFLOW_ERROR')
  }
}
```

Consumers must be able to `catch` and `instanceof`-check specific errors to handle them differently.

---

## Testing strategy

### Philosophy

This is a developer tool. If the internals break, someone's production bot goes down. Test coverage must be high on the core logic, and every public API must have tests that serve as usage documentation.

### Test categories

**Unit tests** (`tests/unit/`) — test a single function or module in isolation. All dependencies are mocked or stubbed. These run fast (< 1s total) and catch logic bugs.

**Integration tests** (`tests/integration/`) — test multiple modules wired together. Use real `MemoryStore`, real tool definitions, but mock the LLM and WhatsApp API. These catch wiring bugs.

**No E2E tests in the framework itself.** E2E tests that hit real WhatsApp or real LLMs belong in the example apps, not in the framework test suite. Framework tests must run without API keys or network access.

### What to test and how

**Core processor** — Test the dispatch logic: given a session state (no workflow, mid-workflow, pending confirmation) and an inbound message, does it route to the right handler? Mock the LLM call and verify tool selection, message history updates, and session persistence.

**Workflow executor** — The most critical module. Test each step type (`tool`, `ask_user`, `confirmation`) independently. Test multi-step flows end-to-end with a mock adapter. Test edge cases: user cancels mid-flow, workflow step fails, user sends unexpected input. Test that session state is correctly saved after each step.

**Auth gate** — Test each combination: known user + authenticated, known user + denied, unknown user + guest fallback, unknown user + no fallback, expired cache triggers re-auth.

**Session stores** — Both `MemoryStore` and `SQLiteStore` must pass the same test suite (test against the `SessionStore` interface). Test: get/set/delete, TTL expiry, cleanup, concurrent access, serialization of all session fields.

**Channel adapter** — Test inbound parsing for every WhatsApp message type (text, button reply, list reply, image, location, status update). Test outbound rendering: options with ≤ 3 items → buttons, > 3 → list. Test edge cases: malformed payloads, missing fields.

**Tool registry** — Test registration, lookup by name, filtering by permissions, duplicate name detection.

**Safety middleware** — Test action level classification, confirmation requirements, rate limiting (use a fake clock).

### Testing patterns

**Mock the LLM with a predictable responder:**

```typescript
// tests/fixtures/mock-model.ts
import { MockLanguageModelV1 } from 'ai/test'

export function createMockModel(responses: string[]) {
  let callIndex = 0
  return new MockLanguageModelV1({
    doGenerate: async () => ({
      text: responses[callIndex++] ?? 'No more responses',
      toolCalls: [],
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 10 },
    }),
  })
}
```

Vercel AI SDK ships a `MockLanguageModelV1` specifically for testing. Use it. Never mock `generateText` itself — mock the model so the full AI SDK pipeline runs.

**Use fixture factories for test data:**

```typescript
// tests/fixtures/sessions.ts

export function createTestSession(overrides?: Partial<Session>): Session {
  return {
    id: 'wa_5511999887766',
    channelUserId: '5511999887766',
    customer: null,
    auth: { status: null, cachedUntil: 0 },
    permissions: { role: 'default', allowedTools: '*', allowedWorkflows: '*' },
    messages: [],
    workflow: { name: null, currentStep: null, collectedData: {}, pendingConfirmation: null },
    createdAt: new Date(),
    lastMessageAt: new Date(),
    messageCount: 0,
    ...overrides,
  }
}
```

**Test the SessionStore interface, not the implementation:**

```typescript
// tests/unit/session/stores/store-contract.ts

export function testSessionStoreContract(createStore: () => SessionStore) {
  describe('SessionStore contract', () => {
    let store: SessionStore

    beforeEach(() => { store = createStore() })

    it('returns null for non-existent session', async () => {
      expect(await store.get('nonexistent')).toBeNull()
    })

    it('round-trips a session through set/get', async () => {
      const session = createTestSession()
      await store.set(session.id, session)
      const retrieved = await store.get(session.id)
      expect(retrieved).toEqual(session)
    })

    it('deletes a session', async () => {
      const session = createTestSession()
      await store.set(session.id, session)
      await store.delete(session.id)
      expect(await store.get(session.id)).toBeNull()
    })

    // ... more shared tests
  })
}

// Then in each store's test file:
// memory.test.ts
testSessionStoreContract(() => new MemoryStore())

// sqlite.test.ts
testSessionStoreContract(() => new SQLiteStore({ path: ':memory:' }))
```

This guarantees all store implementations behave identically.

### Test file naming

- Tests mirror the source structure: `src/core/router.ts` → `tests/unit/core/router.test.ts`
- Fixtures go in `tests/fixtures/` and are shared across test files
- Integration tests are named by the flow they test: `full-message-flow.test.ts`

### Coverage targets

- Core processor, router, workflow executor: > 90%
- Auth gate: > 90%
- Session stores: > 95% (data integrity is critical)
- Channel adapter parsing: > 90%
- Safety middleware: > 85%
- Overall: > 80%

---

## Code style and conventions

### Formatting and linting

Use **Biome** for both formatting and linting (replaces ESLint + Prettier with a single, fast tool).

```json
// biome.json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "rules": {
      "recommended": true,
      "correctness": { "noUnusedImports": "error", "noUnusedVariables": "warn" },
      "suspicious": { "noExplicitAny": "error" },
      "style": { "useConst": "error" }
    }
  }
}
```

### Naming conventions

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `workflow-executor.ts` |
| Functions | camelCase | `executeStep()` |
| Types/Interfaces | PascalCase | `SessionStore`, `InboundMessage` |
| Constants | SCREAMING_SNAKE | `DEFAULT_MAX_MESSAGES` |
| Private fields | prefixed `_` only if needed for clarity | Prefer function scope |
| Test descriptions | lowercase, natural language | `'returns null for expired sessions'` |

### Import ordering

```typescript
// 1. Node built-ins
import { createHmac } from 'node:crypto'

// 2. External packages
import { generateText, tool } from 'ai'
import { z } from 'zod'
import { Hono } from 'hono'

// 3. Internal absolute imports (from other modules)
import { SessionStore } from '../session/stores/interface'
import { ChannelAdapter } from '../channels/interface'

// 4. Relative imports (same module)
import { buildSystemPrompt } from './prompts'
```

### Function size and complexity

- **Max 40 lines per function.** If it's longer, extract helpers.
- **Max 3 levels of nesting.** Use early returns and guard clauses.
- **Max 4 parameters.** Beyond that, use a config/options object.

```typescript
// BAD: Deep nesting, long function
async function processMessage(inbound, config) {
  const session = await config.store.get(inbound.channelUserId)
  if (session) {
    if (session.auth.status === 'authenticated') {
      if (session.workflow.name) {
        if (session.workflow.pendingConfirmation) {
          // ... deeply nested logic
        }
      }
    }
  }
}

// GOOD: Guard clauses, flat structure
async function processMessage(inbound, config) {
  const session = await config.store.getOrCreate(inbound.channelUserId)

  const authResult = await runAuthGate(session, inbound, config)
  if (authResult.blocked) return

  if (session.workflow.pendingConfirmation) {
    return handleWorkflowResponse(session, inbound, config)
  }

  if (session.workflow.name) {
    return continueWorkflow(session, inbound, config)
  }

  return routeNewMessage(session, inbound, config)
}
```

### Async patterns

- Always use `async/await`, never raw Promises with `.then()` chains
- Every `await` that can fail must be in a try/catch or the error must propagate to a handler that owns the recovery
- Never fire-and-forget: if you intentionally don't await something, use `void` prefix and add a comment explaining why

```typescript
// BAD: Silent failure
processMessage(inbound, config) // no await, no void

// GOOD: Explicit async detach with error boundary
void processMessage(inbound, config).catch((err) => {
  logger.error('Message processing failed', { sessionId: inbound.channelUserId, error: err })
})
```

### JSDoc rules

Every **public** function and type gets JSDoc. Internal functions get JSDoc only if the purpose isn't obvious from the name and types.

```typescript
/**
 * Define a tool that the AI agent can call during conversations.
 *
 * Tools represent actions the agent can take — calling APIs, querying databases,
 * or performing calculations. Each tool has a Zod schema that the LLM uses to
 * generate valid inputs.
 *
 * @example
 * ```typescript
 * const checkWeather = defineTool({
 *   name: 'checkWeather',
 *   description: 'Use when the user asks about weather in a city.',
 *   parameters: z.object({ city: z.string() }),
 *   execute: async ({ city }) => fetchWeather(city),
 * })
 * ```
 */
export function defineTool<T extends z.ZodType>(config: ToolConfig<T>): ToolDefinition { }
```

---

## Build and publish

### Build with tsup

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'channels/whatsapp': 'src/channels/whatsapp/adapter.ts',
    'stores/sqlite': 'src/session/stores/sqlite.ts',
    'stores/redis': 'src/session/stores/redis.ts',
  },
  format: ['esm'],
  dts: true,                // Generate .d.ts declaration files
  clean: true,
  splitting: true,          // Code-split shared chunks
  treeshake: true,
  target: 'node20',
  external: ['ai', 'zod', 'ioredis', 'better-sqlite3'],
})
```

ESM-only output. No CJS dual-publish — it's 2026, the ecosystem has moved on.

### Package exports

```json
{
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./channels/whatsapp": { "import": "./dist/channels/whatsapp.js", "types": "./dist/channels/whatsapp.d.ts" },
    "./stores/sqlite": { "import": "./dist/stores/sqlite.js", "types": "./dist/stores/sqlite.d.ts" },
    "./stores/redis": { "import": "./dist/stores/redis.js", "types": "./dist/stores/redis.d.ts" }
  }
}
```

### Version management

Use **changesets** for versioning. Every PR that changes public API or behavior must include a changeset describing what changed and at what semver level.

---

## Git conventions

### Branch strategy

- `main` — always releasable
- `feat/<name>` — feature branches
- `fix/<name>` — bug fixes

### Commit messages

Follow conventional commits:

```
feat(core): add workflow executor with step types
fix(whatsapp): handle missing contact profile in webhook payload
test(session): add SQLiteStore contract tests
docs: update README with quick start example
refactor(auth): extract gate logic into pure functions
```

### PR checklist

Before merging any PR:

- [ ] All tests pass (`pnpm test`)
- [ ] No type errors (`pnpm typecheck`)
- [ ] Linting passes (`pnpm lint`)
- [ ] New public APIs have JSDoc with `@example`
- [ ] New features have unit tests
- [ ] Changeset included (if public API changed)

---

## Implementation order (Phase 1)

Build in this sequence. Each step produces a testable, working increment.

### Step 1: Project scaffold + types

Set up the repo: `package.json`, `tsconfig.json`, `tsup.config.ts`, `biome.json`, `vitest.config.ts`. Define all core types: `Session`, `InboundMessage`, `OutboundMessage`, `ChannelAdapter`, `SessionStore`, `ToolDefinition`, `WorkflowDefinition`, `KonvoConfig`. No logic yet — just the shapes.

**Testable output:** Types compile. Build produces `.d.ts` files.

### Step 2: Session stores

Implement `MemoryStore` and `SQLiteStore`. Write the shared contract test suite. Implement `SessionManager` with `getOrCreate`, sliding window history, and TTL.

**Testable output:** Both stores pass the full contract test suite. Session history correctly trims at the configured limit.

### Step 3: Tool registry + defineTool

Implement `defineTool()` helper and `ToolRegistry` (add, get, getAll, filterByPermissions). Write tests for registration, lookup, and permission filtering.

**Testable output:** Tools can be defined, registered, looked up by name, and filtered by a permissions object.

### Step 4: WhatsApp channel adapter

Implement `WhatsAppAdapter.parseInbound()` for text, button reply, list reply. Implement `sendOutbound()` for text, options (buttons vs list), and confirmation. Write tests using real webhook payload fixtures (capture these from Meta's documentation).

**Testable output:** Parsing extracts correct data from every supported message type. Outbound formatting produces valid WhatsApp API payloads.

### Step 5: Auth gate

Implement the identify → authenticate pipeline. Implement `onUnauthenticated` handlers. Implement auth caching in the session. Write tests for all auth paths (known + allowed, known + denied, unknown + fallback, unknown + blocked, cache hit, cache expired).

**Testable output:** Auth gate correctly allows/denies/limits based on the user's auth functions.

### Step 6: Agent core — router

Implement `routeNewMessage()` using AI SDK `generateText()` with tools. Implement `buildSystemPrompt()`. Implement conversation history append + session save. Write tests using `MockLanguageModelV1`.

**Testable output:** Given a user message and a set of tools, the router calls the LLM, executes tools, appends history, and produces a response.

### Step 7: Workflow executor

Implement the workflow executor: `executeStep()` for `tool`, `ask_user`, `confirmation` types. Implement `handleWorkflowResponse()` for processing user replies to workflow prompts. Implement `continueWorkflow()` for advancing through steps. Wire into the central processor's dispatch logic. Write tests for full workflow execution: start → collect data → confirm → execute → respond.

**Testable output:** A multi-step workflow runs from start to finish through the framework, correctly managing session state at each step.

### Step 8: Safety middleware

Implement action level classification. Implement confirmation requirement check. Wire into the tool execution path.

**Testable output:** Write-level tools require confirmation. Destructive tools require confirmation. Read tools execute directly.

### Step 9: HTTP server + webhook

Implement `createServer()` with Hono. Implement webhook signature verification middleware. Wire the full pipeline: webhook → adapter → processor → response. Write integration tests that POST a fake webhook payload and verify the response.

**Testable output:** A POST to `/webhook` with a valid payload is processed end-to-end.

### Step 10: Main Konvo class

Implement the `Konvo` class that ties everything together. Config validation with actionable error messages. The `listen(port)` method. Wire all internal components.

**Testable output:** `new Konvo(config).listen(3000)` starts a working server.

### Step 11: Clinic bot example

Build the example app: mock clinic API, tool definitions, workflows, auth config. Write a comprehensive README for the example. Test the full flow manually via WhatsApp (or simulator).

**Testable output:** Clone → install → run → send WhatsApp message → get a working response with buttons and confirmations.

### Step 12: README + publish

Write the framework README: problem statement, quick start, architecture diagram, full example, API reference overview. Publish to npm.

**Testable output:** `npm install <package-name>` works. README is compelling.

---

## Common pitfalls

### WhatsApp-specific gotchas

- **Respond 200 within 20 seconds.** Meta retries if your webhook doesn't respond quickly. Always respond immediately and process async.
- **Status updates are not messages.** The webhook fires for delivery receipts, read receipts, and typing indicators too. The adapter must filter these out (return `null` from `parseInbound`).
- **24-hour conversation window.** You can only send free-form messages within 24 hours of the user's last message. After that, you need approved message templates.
- **Interactive messages have limits.** Quick Reply buttons: max 3. List sections: max 10 rows per section, max 10 sections. Button labels: max 20 characters.
- **Phone number format.** WhatsApp sends phone numbers without the `+` prefix. Store and compare consistently.

### AI SDK gotchas

- **`maxSteps` defaults to 1.** If you don't set it higher, the LLM will call a tool but never see the result and generate a response from it. Set to 5 for most use cases.
- **Tool descriptions matter enormously.** The LLM decides which tool to call based on the description. Write them as instructions: "Use this when..." not "Retrieves a list of..."
- **Mock the model, not `generateText`.** AI SDK ships `MockLanguageModelV1` for testing. Mocking `generateText` itself skips the SDK's internal logic and leads to tests that pass but don't reflect reality.

### Framework design gotchas

- **Don't import from deep paths in the public API.** Users should only import from `konvo`, `konvo/channels/whatsapp`, and `konvo/stores/*`. Internal modules must not be importable.
- **Config validation must run at `new Konvo()` time**, not at `listen()` time. Fail fast with clear errors.
- **Session serialization must handle Dates.** JSON.stringify converts Dates to strings. JSON.parse doesn't convert them back. Use a reviver or store timestamps as ISO strings/numbers.

---

## Performance considerations

- **Session reads/writes are on the hot path.** Every message does one read and one write. SQLite is synchronous and fast (~1ms per 10KB write). Redis is async and fast (~1ms). Don't add unnecessary serialization or validation in the store path.
- **LLM calls are the bottleneck.** A `generateText` call takes 500ms-3s depending on the model and input size. Everything else in the pipeline is negligible by comparison. Don't over-optimize the framework internals at the expense of readability.
- **Conversation history grows.** The sliding window (default 20 messages) keeps token count bounded. But each message in the window costs tokens on every LLM call. If the user configures a large window (50+), warn them about cost implications.
- **WhatsApp has rate limits.** The Cloud API has throughput limits based on your phone number's quality tier (typically 80-1000 messages/second). The framework doesn't need to handle this — Meta manages it — but the user should be aware.