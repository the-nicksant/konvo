/**
 * Clinic Bot — a WhatsApp AI agent for appointment management.
 *
 * Demonstrates:
 * - Tool definitions with action levels
 * - Multi-step workflows with interactive buttons
 * - Auth gate that identifies patients by phone number
 * - SQLite session persistence
 *
 * Prerequisites:
 * - OPENAI_API_KEY environment variable set
 * - WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_VERIFY_TOKEN, WA_APP_SECRET set
 *   (see README.md for how to get these from Meta Developer Portal)
 */
import { openai } from "@ai-sdk/openai";
import { Konvo } from "konvo";
import { whatsapp } from "konvo/channels/whatsapp";
import { SQLiteStore } from "konvo/stores/sqlite";
import type { UserIdentity } from "konvo";
import { startMockApi } from "./mock-api.js";
import { checkAvailability, getMyAppointments, bookAppointment, cancelAppointment } from "./tools.js";
import { newBookingWorkflow, cancelBookingWorkflow } from "./workflows.js";

// ---------------------------------------------------------------------------
// Start the mock clinic API (replace with your real API in production)
// ---------------------------------------------------------------------------

startMockApi(3001);

// ---------------------------------------------------------------------------
// Shared webhook credentials
// verifyToken is used by both the WhatsApp adapter (Hub GET verification)
// and the top-level webhook config (HMAC POST verification).
// ---------------------------------------------------------------------------

const WA_VERIFY_TOKEN = process.env.WA_VERIFY_TOKEN ?? "";
const WA_APP_SECRET = process.env.WA_APP_SECRET ?? "";

// ---------------------------------------------------------------------------
// Patient database lookup
//
// In production this would query your CRM or patient management system.
// Here we call the mock API.
// ---------------------------------------------------------------------------

async function resolvePatient(phone: string): Promise<UserIdentity | null> {
  try {
    const res = await fetch(`http://localhost:3001/patients/by-phone/${phone}`);
    if (!res.ok) return null;
    const patient = (await res.json()) as { id: string; name: string; phone: string; email: string };
    return {
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      metadata: { email: patient.email },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Konvo agent
// ---------------------------------------------------------------------------

const agent = new Konvo({
  agent: {
    model: openai("gpt-4o-mini"),
    instructions: `You are a friendly appointment assistant for Sunshine Clinic.
Your name is Sunny. Keep responses brief and warm.

You can help patients:
- Check their upcoming appointments
- Book new appointments
- Cancel existing appointments

Always address patients by their first name when known.
For dates, always use YYYY-MM-DD format internally but display them in a friendly format (e.g. "Monday, May 10th").
If a patient is not registered, politely let them know they need to register in person first.`,
    maxSteps: 5,
  },

  channel: whatsapp({
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID ?? "",
    accessToken: process.env.WA_ACCESS_TOKEN ?? "",
    verifyToken: WA_VERIFY_TOKEN,
    appSecret: WA_APP_SECRET,
  }),

  tools: [checkAvailability, getMyAppointments, bookAppointment, cancelAppointment],

  workflows: [newBookingWorkflow, cancelBookingWorkflow],

  auth: {
    resolve: resolvePatient,
    authenticate: async (user) => {
      if (user) return { status: "authenticated" };
      return { status: "denied", reason: "not_registered" };
    },
    onUnauthenticated: {
      not_registered: {
        message:
          "Hi! I don't have you in our system yet. Please visit Sunshine Clinic in person to register, and then I'll be able to help you book appointments via WhatsApp.",
      },
    },
    cacheFor: 3600, // re-check auth at most once per hour
  },

  store: new SQLiteStore({ path: "./sessions.db" }),

  webhook: {
    verifyToken: WA_VERIFY_TOKEN,
    appSecret: WA_APP_SECRET,
  },
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000);
await agent.listen(PORT);
