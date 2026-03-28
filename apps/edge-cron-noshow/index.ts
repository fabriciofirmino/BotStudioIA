import {
  SupabaseClient,
  WahaClient,
  structuredLog,
  normalizePhone,
} from "../../packages/studioflow-sdk/src/index.ts";
import type {
  Appointment,
  Unit,
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

  // 30 minutes ago
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  let marked = 0;
  let errors = 0;

  try {
    const appointments = await supabase.query<Appointment>("Appointment", {
      filters: {
        status: "eq.CONFIRMED",
        endsAt: `lt.${thirtyMinAgo.toISOString()}`,
      },
    });

    structuredLog("info", "cron_noshow_start", {
      count: appointments.length,
      threshold: thirtyMinAgo.toISOString(),
    });

    for (const appt of appointments) {
      try {
        // Update status to CANCELLED with retroReason no-show
        await supabase.update<Appointment>("Appointment", appt.id, {
          status: "CANCELLED",
          retroReason: "no-show",
        });

        const [units, clients] = await Promise.all([
          supabase.query<Unit>("Unit", {
            filters: { id: `eq.${appt.unitId}` },
            limit: 1,
          }),
          supabase.query<Client>("Client", {
            filters: { id: `eq.${appt.clientId}` },
            limit: 1,
          }),
        ]);

        const unit = units[0];
        const client = clients[0];

        if (!unit || !client) {
          structuredLog("warn", "cron_noshow_skip_missing_data", {
            appointmentId: appt.id,
          });
          marked++;
          continue;
        }

        if (!unit.whatsappInstance) {
          structuredLog("warn", "cron_noshow_skip_no_instance", {
            unitId: unit.id,
            appointmentId: appt.id,
          });
          marked++;
          continue;
        }

        const message = [
          `Olá ${client.name}, notamos que você não compareceu ao seu agendamento na ${unit.name}.`,
          `Gostaria de remarcar? Responda SIM e encontraremos o melhor horário para você! 😊`,
        ].join("\n");

        const phone = normalizePhone(client.phone);
        await waha.sendText(unit.whatsappInstance, phone, message);

        marked++;

        structuredLog("info", "cron_noshow_marked", {
          unitId: unit.id,
          appointmentId: appt.id,
          phone,
        });
      } catch (err) {
        errors++;
        structuredLog("error", "cron_noshow_appointment_error", {
          appointmentId: appt.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    structuredLog("error", "cron_noshow_fatal", {
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

  structuredLog("info", "cron_noshow_done", { processed: marked, errors });

  return new Response(
    JSON.stringify({ success: true, processed: marked, errors }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
