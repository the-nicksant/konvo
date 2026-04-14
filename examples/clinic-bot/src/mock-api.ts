/**
 * Fake clinic REST API — runs on port 3001.
 *
 * In a real deployment this would be your actual clinic management system.
 * This mock lets you run the example without any external services.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// In-memory data
// ---------------------------------------------------------------------------

export interface Patient {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  type: string;
  status: "scheduled" | "cancelled";
}

export interface Slot {
  slotId: string;
  time: string; // HH:MM
  available: boolean;
}

const patients: Patient[] = [
  { id: "p1", name: "Maria Silva",   phone: "5511999887766", email: "maria@example.com" },
  { id: "p2", name: "João Costa",    phone: "5511988776655", email: "joao@example.com" },
  { id: "p3", name: "Ana Oliveira",  phone: "5511977665544", email: "ana@example.com" },
];

const appointments: Appointment[] = [
  {
    id: "a1",
    patientId: "p1",
    date: "2026-04-20",
    time: "09:00",
    type: "General Check-up",
    status: "scheduled",
  },
  {
    id: "a2",
    patientId: "p1",
    date: "2026-05-05",
    time: "14:00",
    type: "Follow-up",
    status: "scheduled",
  },
];

let nextAppointmentId = 10;

// Generate available slots for any given date
function generateSlots(date: string): Slot[] {
  // Simulate some slots taken based on existing appointments
  const taken = new Set(
    appointments
      .filter((a) => a.date === date && a.status === "scheduled")
      .map((a) => a.time),
  );

  const times = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
                 "11:00", "14:00", "14:30", "15:00", "15:30", "16:00"];

  return times.map((time) => ({
    slotId: `${date}-${time.replace(":", "")}`,
    time,
    available: !taken.has(time),
  }));
}

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

/** Look up a patient by phone number */
app.get("/patients/by-phone/:phone", (c) => {
  const patient = patients.find((p) => p.phone === c.req.param("phone"));
  if (!patient) return c.json({ error: "Patient not found" }, 404);
  return c.json(patient);
});

/** Get a patient's upcoming appointments */
app.get("/patients/:patientId/appointments", (c) => {
  const upcoming = appointments.filter(
    (a) => a.patientId === c.req.param("patientId") && a.status === "scheduled",
  );
  return c.json(upcoming);
});

/** Get available slots for a date */
app.get("/availability", (c) => {
  const date = c.req.query("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "date query parameter required (YYYY-MM-DD)" }, 400);
  }
  const slots = generateSlots(date).filter((s) => s.available);
  return c.json(slots);
});

/** Book an appointment */
app.post("/appointments", async (c) => {
  const body = await c.req.json<{ patientId: string; date: string; slotId: string; type?: string }>();
  const slot = generateSlots(body.date).find((s) => s.slotId === body.slotId);

  if (!slot || !slot.available) {
    return c.json({ error: "Slot not available" }, 409);
  }

  const appt: Appointment = {
    id: `a${nextAppointmentId++}`,
    patientId: body.patientId,
    date: body.date,
    time: slot.time,
    type: body.type ?? "General Check-up",
    status: "scheduled",
  };
  appointments.push(appt);
  return c.json(appt, 201);
});

/** Cancel an appointment */
app.delete("/appointments/:id", (c) => {
  const appt = appointments.find((a) => a.id === c.req.param("id"));
  if (!appt) return c.json({ error: "Appointment not found" }, 404);
  appt.status = "cancelled";
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Server start
// ---------------------------------------------------------------------------

export function startMockApi(port = 3001): void {
  serve({ fetch: app.fetch, port }, () => {
    console.log(`[clinic-api] Mock clinic API running on http://localhost:${port}`);
  });
}
