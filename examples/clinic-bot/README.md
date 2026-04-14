# Clinic Bot

A WhatsApp AI agent for appointment management, built with `konvo`.

**What it demonstrates:**

- Defining tools with action levels (`read`, `write`, `destructive`)
- Multi-step workflows with WhatsApp interactive buttons
- An auth gate that identifies patients by phone number and blocks unknown users
- SQLite session persistence for production use
- A mock clinic REST API the bot calls to book and cancel appointments

---

## Architecture

```
WhatsApp User
      │
      ▼ webhook
┌─────────────┐        ┌──────────────────┐
│  konvo      │─fetch→ │  Mock Clinic API  │
│  port 3000  │        │  port 3001        │
└─────────────┘        └──────────────────┘
```

The bot starts two HTTP servers on startup:
- **port 3000** — konvo webhook server (registered with Meta)
- **port 3001** — mock clinic API (replace with your real API)

---

## Prerequisites

- Node.js 20+
- An OpenAI API key
- A Meta WhatsApp Business Account (see below)

---

## Setup

### 1. Install dependencies

```bash
cd examples/clinic-bot
npm install
```

### 2. Set environment variables

Create a `.env` file (or export these in your shell):

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Meta WhatsApp Cloud API
# Get these from https://developers.facebook.com → Your App → WhatsApp → API Setup
WA_PHONE_NUMBER_ID=1234567890
WA_ACCESS_TOKEN=EAAxxxxx...

# Webhook credentials — you choose these values
WA_VERIFY_TOKEN=my-secret-verify-token
WA_APP_SECRET=abcdef1234567890...   # App Settings → Basic → App Secret

# Optional
PORT=3000
```

### 3. Register the webhook with Meta

After starting the bot, your webhook URL must be publicly accessible. Use [ngrok](https://ngrok.com) for local testing:

```bash
ngrok http 3000
```

Then in the Meta Developer Portal:
1. Go to **WhatsApp → Configuration → Webhook**
2. Set the callback URL to `https://<your-ngrok-subdomain>.ngrok.io/webhook`
3. Set the verify token to the same value as `WA_VERIFY_TOKEN`
4. Subscribe to the **messages** webhook field

### 4. Start the bot

```bash
npm start
```

You should see:

```
[clinic-api] Mock clinic API running on http://localhost:3001
[konvo] Listening on http://localhost:3000
```

---

## Test patients

The mock API has three pre-registered patients. Send a WhatsApp message from one of these numbers to see authenticated interactions:

| Name         | Phone (WhatsApp format) |
|--------------|------------------------|
| Maria Silva  | 5511999887766          |
| João Costa   | 5511988776655          |
| Ana Oliveira | 5511977665544          |

Any other number will get the "not registered" message.

---

## Example conversations

### Booking an appointment

```
User:  I'd like to book an appointment
Bot:   Sure! What date would you like? (e.g. 2026-05-10)
User:  2026-05-15
Bot:   There are 12 slots available on 2026-05-15. Which time works?
       [08:00] [08:30] [09:00] ▾ more options
User:  [taps 10:00]
Bot:   Confirm appointment on 2026-05-15 at 10:00?
       [Yes, book it] [No, cancel]
User:  [taps Yes, book it]
Bot:   Your appointment has been booked! You'll receive a reminder 24 hours before.
```

### Cancelling an appointment

```
User:  Cancel my appointment
Bot:   Which appointment would you like to cancel?
       [2026-04-20 09:00 — General Check-up]
       [2026-05-05 14:00 — Follow-up]
User:  [taps the April 20 appointment]
Bot:   Cancel your appointment on 2026-04-20 at 09:00?
       [Yes, cancel it] [Keep it]
User:  [taps Yes, cancel it]
Bot:   Your appointment has been cancelled.
```

### Unregistered user

```
User:  Hi, I'd like to book an appointment
Bot:   Hi! I don't have you in our system yet. Please visit Sunshine Clinic
       in person to register, and then I'll be able to help you book
       appointments via WhatsApp.
```

---

## Adapting for production

1. **Replace the mock API** — update `API_BASE` in `src/tools.ts` and remove `startMockApi()` from `src/index.ts`
2. **Update `resolvePatient`** — point it at your patient database
3. **Switch to a real LLM** — swap `openai("gpt-4o-mini")` for any AI SDK model
4. **Set up a real server** — deploy to any Node.js host (Railway, Fly.io, AWS, etc.)
