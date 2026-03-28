import {
  SupabaseClient,
  WahaClient,
  structuredLog,
  formatDate,
  formatTime,
  formatCurrency,
  normalizePhone,
} from "../../packages/studioflow-sdk/src/index.ts";
import type {
  Appointment,
  Unit,
  Service,
  Professional,
  Client,
} from "../../packages/studioflow-sdk/src/index.ts";

Deno.serve(async (_req: Request) => {
  const supabase = new SupabaseClient({
    url: Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  });

  const waha = new WahaClient({
    apiUrl: Deno.env.get("WAHA_API_URL") ?? "",
    apiKey: Deno.env.get("WAHA_API_KEY") ?? "",
  });

  let confirmed = 0;
  let errors = 0;

  try {
    const appointments = await supabase.query<Appointment>("Appointment", {
      filters: { status: "eq.PENDING" },
    });

    structuredLog("info", "cron_confirmacao_start", {
      count: appointments.length,
    });

    for (const appt of appointments) {
      try {
        const [units, services, professionals, clients] = await Promise.all([
          supabase.query<Unit>("Unit", {
            filters: { id: `eq.${appt.unitId}` },
            limit: 1,
          }),
          supabase.query<Service>("Service", {
            filters: { id: `eq.${appt.serviceId}` },
            limit: 1,
          }),
          supabase.query<Professional>("Professional", {
            filters: { id: `eq.${appt.professionalId}` },
            limit: 1,
          }),
          supabase.query<Client>("Client", {
            filters: { id: `eq.${appt.clientId}` },
            limit: 1,
          }),
        ]);

        const unit = units[0];
        const service = services[0];
        const professional = professionals[0];
        const client = clients[0];

        if (!unit || !service || !professional || !client) {
          structuredLog("warn", "cron_confirmacao_skip_missing_data", {
            appointmentId: appt.id,
          });
          continue;
        }

        if (!unit.whatsappInstance) {
          structuredLog("warn", "cron_confirmacao_skip_no_instance", {
            unitId: unit.id,
            appointmentId: appt.id,
          });
          continue;
        }

        const price = appt.totalPrice ?? service.price;
        const message = [
          `Olá, ${client.name}! 👋`,
          `Confirmando seu agendamento na ${unit.name}:`,
          `📋 Serviço: ${service.name}`,
          `👤 Profissional: ${professional.name}`,
          `📅 ${formatDate(appt.startsAt)}`,
          `⏰ ${formatTime(appt.startsAt)}`,
          `💰 ${formatCurrency(price)}`,
          ``,
          `Responda SIM para confirmar ou NÃO para remarcar.`,
        ].join("\n");

        const phone = normalizePhone(client.phone);
        await waha.sendText(unit.whatsappInstance, phone, message);

        await supabase.update<Appointment>("Appointment", appt.id, {
          status: "CONFIRMED",
        });

        confirmed++;

        structuredLog("info", "cron_confirmacao_sent", {
          unitId: unit.id,
          appointmentId: appt.id,
          phone,
        });
      } catch (err) {
        errors++;
        structuredLog("error", "cron_confirmacao_appointment_error", {
          appointmentId: appt.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    structuredLog("error", "cron_confirmacao_fatal", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  structuredLog("info", "cron_confirmacao_done", { processed: confirmed, errors });

  return new Response(
    JSON.stringify({ success: true, processed: confirmed, errors }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
