/**
 * Clinic conversation workflows.
 *
 * Workflows are structured multi-step flows that collect data, confirm with
 * the user, and execute actions — without relying on the LLM to manage state.
 */
import { defineWorkflow, step } from "konvo";

// ---------------------------------------------------------------------------
// Workflow: Book a new appointment
// ---------------------------------------------------------------------------

export const newBookingWorkflow = defineWorkflow({
  name: "newBooking",
  trigger: "User wants to book, schedule, or make a new appointment",
  steps: [
    // Step 1: Ask what date they want
    step("askDate", {
      type: "ask_user",
      message: "Sure! What date would you like your appointment? (e.g. 2026-05-10)",
    }),

    // Step 2: Fetch available slots for that date
    step("getAvailability", {
      type: "tool",
      tool: "checkAvailability",
      input: (ctx) => ({ date: ctx.collectedData.askDate as string }),
      onEmptyResult: {
        message: "Sorry, there are no available slots on that date.",
        fallback: "Would you like to try a different date?",
      },
    }),

    // Step 3: Ask which time they want (options from availability result)
    step("pickSlot", {
      type: "ask_user",
      message: (ctx) => {
        const availability = ctx.collectedData.getAvailability as
          | { availableSlots: Array<{ slotId: string; time: string }> }
          | undefined;
        const count = availability?.availableSlots?.length ?? 0;
        return `Great! There are ${count} slots available on ${ctx.collectedData.askDate as string}. Which time works for you?`;
      },
      options: (ctx) => {
        const availability = ctx.collectedData.getAvailability as
          | { availableSlots: Array<{ slotId: string; time: string }> }
          | undefined;
        return (availability?.availableSlots ?? []).map((slot) => ({
          id: slot.slotId,
          label: slot.time,
        }));
      },
    }),

    // Step 4: Confirm before booking
    // Note: collectedData.pickSlot is the slotId (e.g. "2026-05-15-1000"), not the label.
    // We look up the human-readable time from the availability result.
    step("confirm", {
      type: "confirmation",
      message: (ctx) => {
        const availability = ctx.collectedData.getAvailability as
          | { availableSlots: Array<{ slotId: string; time: string }> }
          | undefined;
        const slotId = ctx.collectedData.pickSlot as string;
        const slot = availability?.availableSlots?.find((s) => s.slotId === slotId);
        const time = slot?.time ?? slotId;
        return `Confirm appointment on *${ctx.collectedData.askDate as string}* at *${time}*?`;
      },
      confirmLabel: "Yes, book it",
      cancelLabel: "No, cancel",
    }),

    // Step 5: Create the booking
    step("createBooking", {
      type: "tool",
      tool: "bookAppointment",
      input: (ctx) => ({
        patientId: ctx.customer?.id ?? "",
        date: ctx.collectedData.askDate as string,
        slotId: ctx.collectedData.pickSlot as string,
      }),
      onSuccess: "Your appointment has been booked! You'll receive a reminder 24 hours before.",
      onError: "Sorry, I couldn't complete the booking. Please try again.",
    }),
  ],
});

// ---------------------------------------------------------------------------
// Workflow: Cancel an existing appointment
// ---------------------------------------------------------------------------

export const cancelBookingWorkflow = defineWorkflow({
  name: "cancelBooking",
  trigger: "User wants to cancel or remove an existing appointment",
  steps: [
    // Step 1: Fetch their appointments
    step("loadAppointments", {
      type: "tool",
      tool: "getMyAppointments",
      input: (ctx) => ({ patientId: ctx.customer?.id ?? "" }),
      onEmptyResult: {
        message: "You don't have any upcoming appointments to cancel.",
      },
    }),

    // Step 2: Ask which one to cancel (options built from loaded appointments)
    step("pickAppointment", {
      type: "ask_user",
      message: "Which appointment would you like to cancel?",
      options: (ctx) => {
        const data = ctx.collectedData.loadAppointments as
          | { appointments: Array<{ id: string; date: string; time: string; type: string }> }
          | undefined;
        return (data?.appointments ?? []).map((a) => ({
          id: a.id,
          label: `${a.date} ${a.time} — ${a.type}`,
        }));
      },
    }),

    // Step 3: Confirm before cancelling
    step("confirm", {
      type: "confirmation",
      message: (ctx) => {
        const data = ctx.collectedData.loadAppointments as
          | { appointments: Array<{ id: string; date: string; time: string }> }
          | undefined;
        const appt = data?.appointments?.find(
          (a) => a.id === (ctx.collectedData.pickAppointment as string),
        );
        return appt
          ? `Cancel your appointment on *${appt.date}* at *${appt.time}*?`
          : "Cancel this appointment?";
      },
      confirmLabel: "Yes, cancel it",
      cancelLabel: "Keep it",
    }),

    // Step 4: Cancel the appointment
    step("doCancel", {
      type: "tool",
      tool: "cancelAppointment",
      input: (ctx) => ({ appointmentId: ctx.collectedData.pickAppointment as string }),
      onSuccess: "Your appointment has been cancelled.",
      onError: "Sorry, I couldn't cancel that appointment. Please try again.",
    }),
  ],
});
