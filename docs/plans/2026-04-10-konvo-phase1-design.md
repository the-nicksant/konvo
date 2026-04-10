# Konvo Phase 1 — Design Document

**Date:** 2026-04-10
**Status:** Approved

---

## Goal

Build a working, publishable TypeScript framework that lets developers connect any REST API to a conversational AI agent exposed through WhatsApp — demonstrable via a local clinic bot example (no live Meta API required in Phase 1).

---

## Architecture

Five tiers, strict separation of concerns:

```
Tier 1: HTTP (Hono)          → /webhook + /health, HMAC signature verification
Tier 2: Channel (WhatsApp)   → parse inbound, build outbound (text/buttons/lists)
Tier 3: Session (SQLite/Mem) → per-user state, conversation history window, TTL
Tier 4: Agent core           → router (AI SDK), workflow executor, system prompts
Tier 5: Tool registry        → defineTool(), registry, permissions filter
```

---

## Data Flow

```
POST /webhook
  → verify HMAC signature
  → respond 200 immediately, process async
  → WhatsAppAdapter.parseInbound() → InboundMessage | null
  → SessionManager.getOrCreate(channelUserId)
  → AuthGate: resolve() → authenticate() → onUnauthenticated?
  → Processor dispatch:
      pendingConfirmation? → handleWorkflowResponse()
      activeWorkflow?      → continueWorkflow()
      else                 → routeNewMessage() [AI SDK generateText()]
  → Safety check on every tool execution
  → Session save
  → WhatsAppAdapter.sendOutbound() → WhatsApp Cloud API
```

---

## Implementation Steps (12)

| Step | Module | Testable output |
|------|--------|-----------------|
| 1 | Project scaffold + types | Types compile, build produces `.d.ts` |
| 2 | Session stores | `MemoryStore` + `SQLiteStore` pass shared contract suite |
| 3 | Tool registry + `defineTool()` | Tools register, look up, filter by permissions |
| 4 | WhatsApp adapter | Parses all message types; outbound produces valid WA payloads |
| 5 | Auth gate | All 5 auth paths tested (allow/deny/guest/cache-hit/cache-expired) |
| 6 | Agent core — router | `MockLanguageModelV1` drives tool calls, history appended |
| 7 | Workflow executor | Full `tool → ask_user → confirmation → execute` flow |
| 8 | Safety middleware | Action levels enforced, write/destructive require prior confirmation |
| 9 | HTTP server + webhook | POST to `/webhook` processes end-to-end in integration test |
| 10 | `Konvo` class | `new Konvo(config).listen(3000)` starts the server |
| 11 | Clinic bot example | 4 tools, 2 workflows, mock API, runnable locally |
| 12 | README | Quick start, architecture diagram, full example |

---

## Execution Strategy

**Approach A — Strict CLAUDE.md order, TDD**

- Each step: write failing tests → implement → pass → commit
- Steps commit independently — git history tells the build story
- Steps 2–5: pure logic, no LLM/network, fast
- Steps 6–8: core complexity, most test coverage
- Steps 9–10: wiring

---

## Testing Strategy

**Unit tests** (`tests/unit/`) — single module in isolation, all deps mocked. Target: < 1s total.

**Integration tests** (`tests/integration/`) — multiple modules wired together. Real `MemoryStore`, real tool defs. LLM mocked via `MockLanguageModelV1`. WhatsApp API mocked via stub adapter.

**No E2E** — no real API keys, no network in CI.

### Key patterns

```typescript
// LLM mocked at model level (never mock generateText itself)
import { MockLanguageModelV1 } from 'ai/test'

// Shared store contract — both stores must pass identical suite
testSessionStoreContract(() => new MemoryStore())
testSessionStoreContract(() => new SQLiteStore({ path: ':memory:' }))

// Fixture factories
createTestSession({ workflow: { name: 'rescheduleAppointment', ... } })
```

### Coverage targets
- Core processor / router / workflow executor: > 90%
- Session stores: > 95%
- Auth gate: > 90%
- Overall: > 80%

---

## Error Handling

Typed error hierarchy for consumer `instanceof` checks:

```typescript
KonvoError (base)
├── ConfigValidationError  — bad config caught at new Konvo() time
├── ToolExecutionError     — tool fetch/logic failed
├── AuthDeniedError        — auth gate blocked the message
├── SessionNotFoundError   — store returned null unexpectedly
└── WorkflowError          — step failed during workflow execution
```

Config validation runs at `new Konvo()` time, not `listen()` — fail fast with actionable messages.

---

## Public API Surface

```typescript
// Main imports
import { Konvo, defineTool, defineWorkflow, step } from 'konvo'
import { whatsapp } from 'konvo/channels/whatsapp'
import { SQLiteStore } from 'konvo/stores/sqlite'

// Type imports for user annotations
import type {
  KonvoConfig, ChannelAdapter, SessionStore,
  UserIdentity, AuthResult, UserPermissions
} from 'konvo'
```

Internal modules are not exported or importable by consumers.

---

## Phase 1 Cut List

Explicitly deferred to Phase 2:
- OpenAPI auto-generation
- Role-based `authorize` step (auth = identify + authenticate only)
- Redis store
- Rate limiting
- Audit logging
- Telegram/Slack adapters
- Live WhatsApp delivery (local simulator sufficient for Phase 1 demo)
- 24-hour conversation window / template messages
