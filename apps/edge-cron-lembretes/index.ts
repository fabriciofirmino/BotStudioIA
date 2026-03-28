import {
  SupabaseClient,
  EvolutionClient,
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

  const evolution = new EvolutionClient({
    apiUrl: Deno.env.get("EVOLUTION_API_URL") ?? "",
    apiKey: Deno.env.get("EVOLUTION_API_KEY") ?? "",
  });

  // Calculate tomorrow in São Paulo timezone (UTC-3)
  const now = new Date();
  const saoPaulo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const tomorrowStart = new Date(saoPaulo);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart);
  tomorrowEnd.setHours(23, 59, 59, 999);

  // Convert back to UTC for the query
  const tomorrowStartUTC = new Date(tomorrowStart.getTime() + 3 * 60 * 60 * 1000);
  const tomorrowEndUTC = new Date(tomorrowEnd.getTime() + 3 * 60 * 60 * 1000);

  let sent = 0;
  let errors = 0;

  try {
    // Use rawGet with PostgREST 'and' syntax for range filter on startsAt
    const appointments = await supabase.rawGet<Appointment>(
      `"Appointment"?status=eq.CONFIRMED&and=(startsAt.gte.${tomorrowStartUTC.toISOString()},startsAt.lte.${tomorrowEndUTC.toISOString()})`,
    );

    structuredLog("info", "cron_lembretes_start", {
      count: appointments.length,
      tomorrowStart: tomorrowStartUTC.toISOString(),
      tomorrowEnd: tomorrowEndUTC.toISOString(),
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
          structuredLog("warn", "cron_lembretes_skip_missing_data", {
            appointmentId: appt.id,
          });
          continue;
        }

        if (!unit.whatsappInstance) {
          structuredLog("warn", "cron_lembretes_skip_no_instance", {
            unitId: unit.id,
            appointmentId: appt.id,
          });
          continue;
        }

        const price = appt.totalPrice ?? service.price;
        const confirmationPolicy = unit.aiPolicies?.confirmation ?? "";

        const messageParts: string[] = [
          `Olá, ${client.name}! 😊`,
          `Lembrete do seu agendamento amanhã na ${unit.name}:`,
          `📋 Serviço: ${service.name}`,
          `👤 Profissional: ${professional.name}`,
          `📅 ${formatDate(appt.startsAt)}`,
          `⏰ ${formatTime(appt.startsAt)}`,
          `💰 ${formatCurrency(price)}`,
        ];

        if (confirmationPolicy) {
          messageParts.push("");
          messageParts.push(`ℹ️ ${confirmationPolicy}`);
        }

        messageParts.push("");
        messageParts.push("Estamos te esperando! 💇");

        const message = messageParts.join("\n");
        const phone = normalizePhone(client.phone);
        await evolution.sendText(unit.whatsappInstance, phone, message);

        sent++;

        structuredLog("info", "cron_lembretes_sent", {
          unitId: unit.id,
          appointmentId: appt.id,
          phone,
        });
      } catch (err) {
        errors++;
        structuredLog("error", "cron_lembretes_appointment_error", {
          appointmentId: appt.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    structuredLog("error", "cron_lembretes_fatal", {
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

  structuredLog("info", "cron_lembretes_done", { processed: sent, errors });

  return new Response(
    JSON.stringify({ success: true, processed: sent, errors }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
