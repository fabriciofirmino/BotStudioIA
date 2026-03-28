import {
  SupabaseClient,
  structuredLog,
  normalizePhone,
  formatDate,
  formatTime,
  formatCurrency,
} from "studioflow-sdk";
import type {
  Client,
  Service,
  Professional,
  Appointment,
  CriarAgendamentoInput,
  CancelarAgendamentoInput,
} from "studioflow-sdk";

export async function criarAgendamento(
  supabase: SupabaseClient,
  unitId: string,
  input: CriarAgendamentoInput,
): Promise<string> {
  structuredLog("info", "tool_criar_agendamento", { unitId });

  // Look up or create Client by name + unitId
  let clientId: string;

  try {
    const existingClients = await supabase.query<Client>("Client", {
      select: "id,name,phone",
      filters: {
        name: `eq.${input.client_name}`,
        unitId: `eq.${unitId}`,
      },
      limit: 1,
    });

    if (existingClients.length > 0 && existingClients[0]) {
      clientId = existingClients[0].id;
    } else {
      const newClient = await supabase.insert<Client>("Client", {
        name: input.client_name,
        phone: "",
        unitId,
      });
      clientId = newClient.id;
    }
  } catch (error) {
    structuredLog("error", "criar_agendamento_client_error", {
      unitId,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Erro ao buscar/criar cliente." });
  }

  // Get Service to calculate endsAt
  let service: Service;
  try {
    const services = await supabase.query<Service>("Service", {
      select: "id,name,durationMin,price",
      filters: { id: `eq.${input.service_id}`, unitId: `eq.${unitId}` },
      limit: 1,
    });

    if (!services[0]) {
      return JSON.stringify({ error: "Servico nao encontrado." });
    }
    service = services[0];
  } catch (error) {
    structuredLog("error", "criar_agendamento_service_error", {
      unitId,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Erro ao buscar servico." });
  }

  const startsAt = new Date(input.starts_at);
  const endsAt = new Date(startsAt.getTime() + service.durationMin * 60000);

  // Get professional name for confirmation
  let profName = "Profissional";
  try {
    const professionals = await supabase.query<Professional>("Professional", {
      select: "id,name",
      filters: { id: `eq.${input.professional_id}` },
      limit: 1,
    });
    if (professionals[0]) {
      profName = professionals[0].name;
    }
  } catch {
    // Use default name
  }

  // Insert Appointment with status CONFIRMED, entryMode SCHEDULED
  let appointment: Appointment;
  try {
    appointment = await supabase.insert<Appointment>("Appointment", {
      unitId,
      clientId,
      professionalId: input.professional_id,
      serviceId: input.service_id,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "CONFIRMED",
      entryMode: "SCHEDULED",
      totalPrice: service.price,
    });
  } catch (error) {
    structuredLog("error", "criar_agendamento_insert_error", {
      unitId,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Erro ao criar agendamento." });
  }

  return JSON.stringify({
    success: true,
    appointmentId: appointment.id,
    summary: {
      service: service.name,
      professional: profName,
      date: formatDate(startsAt.toISOString()),
      time: formatTime(startsAt.toISOString()),
      price: formatCurrency(service.price),
      duration: `${service.durationMin} minutos`,
    },
  });
}

export async function cancelarAgendamento(
  supabase: SupabaseClient,
  input: CancelarAgendamentoInput,
): Promise<string> {
  structuredLog("info", "tool_cancelar_agendamento", {
    appointmentId: input.appointment_id,
  });

  try {
    const updated = await supabase.update<Appointment>(
      "Appointment",
      input.appointment_id,
      { status: "CANCELLED" },
    );

    return JSON.stringify({
      success: true,
      message: "Agendamento cancelado com sucesso.",
      appointmentId: updated.id,
    });
  } catch (error) {
    structuredLog("error", "cancelar_agendamento_error", {
      appointmentId: input.appointment_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({ error: "Erro ao cancelar agendamento." });
  }
}
