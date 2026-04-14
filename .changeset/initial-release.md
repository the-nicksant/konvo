---
"konvo": major
---

Initial release of konvo v0.1.0.

A TypeScript framework for building Meta-compliant WhatsApp AI agents powered by the Vercel AI SDK.

**Features:**
- `defineTool()` — connect any REST API endpoint as an LLM-callable tool with Zod schema validation
- `defineWorkflow()` / `step()` — multi-step conversation flows with interactive WhatsApp buttons and lists
- `WhatsAppAdapter` — inbound parsing and outbound rendering for all WhatsApp message types
- Auth gate — identify users by phone, authenticate, authorize with per-user permissions
- Safety middleware — action levels (`read`/`write`/`destructive`) with confirmation prompts and rate limiting
- Session management — pluggable `MemoryStore` (dev) and `SQLiteStore` (production)
- Hono HTTP layer — HMAC-SHA256 webhook signature verification, hub verification, health endpoint
- `Konvo` class — single entry point that wires all tiers together
