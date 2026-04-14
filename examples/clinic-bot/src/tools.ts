/**
 * Clinic-specific tool definitions.
 *
 * Each tool calls the mock clinic API (http://localhost:3001) and
 * formats the response for the AI agent to read.
 *
 * In production you'd point these at your real clinic management API.
 *
 * Note: tools that need the patient ID receive it as an explicit parameter.
 * Workflows inject it via their `input` function using `ctx.customer.id`.
 */
import { defineTool } from "konvo";
import { z } from "zod";

const API_BASE = "http://localhost:3001";

// ---------------------------------------------------------------------------
// Tool: Check available appointment slots
// ---------------------------------------------------------------------------

export const checkAvailability = defineTool({
  name: "checkAvailability",
  description:
    "Use when the user asks about available appointment times for a specific date. " +
    "Returns a list of open time slots with their slot IDs.",
  parameters: z.object({
    date: z.string().describe("Date to check in YYYY-MM-DD format"),
  }),
  execute: async ({ date }) => {
    const res = await fetch(`${API_BASE}/availability?date=${date}`);
    if (!res.ok) return { error: `Failed to fetch availability: ${res.status}` };
    const slots = (await res.json()) as Array<{ slotId: string; time: string }>;
    if (slots.length === 0) return { message: "No available slots on that date." };
    return { availableSlots: slots };
  },
});

// ---------------------------------------------------------------------------
// Tool: Get a patient's upcoming appointments
// ---------------------------------------------------------------------------

export const getMyAppointments = defineTool({
  name: "getMyAppointments",
  description:
    "Use when the user asks to see their upcoming appointments or wants to manage one. " +
    "Returns a list of scheduled appointments for the current patient.",
  parameters: z.object({
    patientId: z.string().describe("The patient's ID"),
  }),
  execute: async ({ patientId }) => {
    const res = await fetch(`${API_BASE}/patients/${patientId}/appointments`);
    if (!res.ok) return { error: `Failed to fetch appointments: ${res.status}` };
    const appointments = (await res.json()) as Array<{
      id: string;
      date: string;
      time: string;
      type: string;
    }>;
    if (appointments.length === 0) return { message: "You have no upcoming appointments." };
    return { appointments };
  },
  formatResponse: (result) => {
    const r = result as { appointments?: Array<{ id: string; date: string; time: string; type: string }>; message?: string };
    if (r.message) return r.message;
    if (!r.appointments) return "Could not load appointments.";
    return r.appointments
      .map((a) => `• ${a.date} at ${a.time} — ${a.type} (ID: ${a.id})`)
      .join("\n");
  },
});

// ---------------------------------------------------------------------------
// Tool: Book an appointment
// ---------------------------------------------------------------------------

export const bookAppointment = defineTool({
  name: "bookAppointment",
  description:
    "Use when the user confirms they want to book an appointment. " +
    "Requires a date, a slot ID from checkAvailability, and the patient's ID.",
  actionLevel: "write",
  parameters: z.object({
    patientId: z.string().describe("The patient's ID"),
    date: z.string().describe("Appointment date in YYYY-MM-DD format"),
    slotId: z.string().describe("Slot ID from checkAvailability"),
    type: z
      .string()
      .optional()
      .describe("Appointment type, e.g. 'General Check-up'. Defaults to General Check-up."),
  }),
  execute: async ({ patientId, date, slotId, type }) => {
    const res = await fetch(`${API_BASE}/appointments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patientId, date, slotId, type }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      return { error: body.error ?? `Booking failed: ${res.status}` };
    }
    const appt = (await res.json()) as { id: string; date: string; time: string; type: string };
    return { success: true, appointment: appt };
  },
  formatResponse: (result) => {
    const r = result as { success?: boolean; appointment?: { date: string; time: string; type: string }; error?: string };
    if (r.error) return `Booking failed: ${r.error}`;
    if (r.appointment) {
      return `Appointment booked for ${r.appointment.date} at ${r.appointment.time} (${r.appointment.type}).`;
    }
    return "Booking processed.";
  },
});

// ---------------------------------------------------------------------------
// Tool: Cancel an appointment
// ---------------------------------------------------------------------------

export const cancelAppointment = defineTool({
  name: "cancelAppointment",
  description:
    "Use when the user confirms they want to cancel an existing appointment. " +
    "Requires the appointment ID from getMyAppointments.",
  actionLevel: "destructive",
  parameters: z.object({
    appointmentId: z.string().describe("ID of the appointment to cancel"),
  }),
  execute: async ({ appointmentId }) => {
    const res = await fetch(`${API_BASE}/appointments/${appointmentId}`, {
      method: "DELETE",
    });
    if (!res.ok) return { error: `Failed to cancel: ${res.status}` };
    return { success: true };
  },
});
