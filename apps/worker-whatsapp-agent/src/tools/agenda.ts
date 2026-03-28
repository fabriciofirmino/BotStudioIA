import {
  SupabaseClient,
  structuredLog,
  formatDate,
} from "studioflow-sdk";
import type {
  Appointment,
  Professional,
  Service,
  ConsultarAgendaInput,
} from "studioflow-sdk";

export async function consultarAgenda(
  supabase: SupabaseClient,
  unitId: string,
  input: ConsultarAgendaInput,
): Promise<string> {
  const targetDate = input.date;
  const dayStart = `${targetDate}T00:00:00`;
  const dayEnd = `${targetDate}T23:59:59`;

  structuredLog("info", "tool_consultar_agenda", { unitId, date: targetDate });

  // Fetch existing appointments for the day
  const apptFilters: Record<string, string> = {
    unitId: `eq.${unitId}`,
    startsAt: `gte.${dayStart}`,
    endsAt: `lte.${dayEnd}`,
    status: `in.(CONFIRMED,PENDING)`,
  };

  if (input.professional_id) {
    apptFilters["professionalId"] = `eq.${input.professional_id}`;
  }

  let appointments: Appointment[];
  try {
    appointments = await supabase.query<Appointment>("Appointment", {
      select: "id,professionalId,serviceId,startsAt,endsAt,status",
      filters: apptFilters,
      order: "startsAt.asc",
    });
  } catch (error) {
    structuredLog("error", "consultar_agenda_appointments_error", {
      unitId,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Erro ao consultar agendamentos." });
  }

  // Fetch professionals
  const profFilters: Record<string, string> = {
    unitId: `eq.${unitId}`,
    isActive: "eq.true",
  };
  if (input.professional_id) {
    profFilters["id"] = `eq.${input.professional_id}`;
  }

  let professionals: Professional[];
  try {
    professionals = await supabase.query<Professional>("Professional", {
      select: "id,name,workStart,workEnd,workingDays",
      filters: profFilters,
    });
  } catch (error) {
    structuredLog("error", "consultar_agenda_professionals_error", {
      unitId,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Erro ao consultar profissionais." });
  }

  // If a service is specified, get its duration
  let serviceDuration = 30; // default 30 min
  if (input.service_id) {
    try {
      const services = await supabase.query<Service>("Service", {
        select: "id,name,durationMin,price",
        filters: { id: `eq.${input.service_id}`, unitId: `eq.${unitId}` },
        limit: 1,
      });
      if (services.length > 0 && services[0]) {
        serviceDuration = services[0].durationMin;
      }
    } catch {
      // Use default duration
    }
  }

  // Calculate available slots per professional
  const availability: Array<{
    professional: string;
    professionalId: string;
    slots: string[];
  }> = [];

  for (const prof of professionals) {
    const dayOfWeek = new Date(targetDate).getDay();
    if (prof.workingDays && !prof.workingDays.includes(dayOfWeek)) {
      continue;
    }

    const workStart = prof.workStart ?? "08:00";
    const workEnd = prof.workEnd ?? "18:00";

    const profAppointments = appointments.filter(
      (a) => a.professionalId === prof.id,
    );

    const slots = calculateAvailableSlots(
      targetDate,
      workStart,
      workEnd,
      serviceDuration,
      profAppointments,
    );

    if (slots.length > 0) {
      availability.push({
        professional: prof.name,
        professionalId: prof.id,
        slots,
      });
    }
  }

  return JSON.stringify({
    date: targetDate,
    dateFormatted: formatDate(`${targetDate}T12:00:00`),
    serviceDurationMin: serviceDuration,
    availability,
  });
}

function calculateAvailableSlots(
  date: string,
  workStart: string,
  workEnd: string,
  durationMin: number,
  existingAppointments: Appointment[],
): string[] {
  const slots: string[] = [];
  const startMinutes = timeToMinutes(workStart);
  const endMinutes = timeToMinutes(workEnd);

  for (let m = startMinutes; m + durationMin <= endMinutes; m += 30) {
    const slotStart = new Date(`${date}T${minutesToTime(m)}:00`);
    const slotEnd = new Date(slotStart.getTime() + durationMin * 60000);

    const hasConflict = existingAppointments.some((appt) => {
      const apptStart = new Date(appt.startsAt);
      const apptEnd = new Date(appt.endsAt);
      return slotStart < apptEnd && slotEnd > apptStart;
    });

    if (!hasConflict) {
      slots.push(
        `${minutesToTime(m)} - ${minutesToTime(m + durationMin)}`,
      );
    }
  }

  return slots;
}

function timeToMinutes(time: string): number {
  const parts = time.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
