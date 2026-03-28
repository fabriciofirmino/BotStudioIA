import {
  SupabaseClient,
  EvolutionClient,
  AnthropicClient,
  extractText,
  structuredLog,
  formatCurrency,
  normalizePhone,
} from "../../packages/studioflow-sdk/src/index.ts";
import type {
  Appointment,
  Unit,
} from "../../packages/studioflow-sdk/src/index.ts";

interface DailyStats {
  unitName: string;
  date: string;
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  confirmed: number;
  pending: number;
  revenue: string;
  revenueRaw: number;
}

Deno.serve(async (_req: Request) => {
  const supabase = new SupabaseClient({
    url: Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  });

  const evolution = new EvolutionClient({
    apiUrl: Deno.env.get("EVOLUTION_API_URL") ?? "",
    apiKey: Deno.env.get("EVOLUTION_API_KEY") ?? "",
  });

  const anthropic = new AnthropicClient({
    apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
  });

  // Calculate today in São Paulo timezone (UTC-3)
  const now = new Date();
  const saoPaulo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const todayStart = new Date(saoPaulo);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);

  // Convert back to UTC for queries
  const todayStartUTC = new Date(todayStart.getTime() + 3 * 60 * 60 * 1000);
  const todayEndUTC = new Date(todayEnd.getTime() + 3 * 60 * 60 * 1000);

  const todayLabel = saoPaulo.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  let reportsSent = 0;
  let errors = 0;

  try {
    const units = await supabase.query<Unit>("Unit", {
      filters: { aiEnabled: "eq.true" },
    });

    structuredLog("info", "cron_relatorio_start", {
      unitCount: units.length,
      todayStart: todayStartUTC.toISOString(),
      todayEnd: todayEndUTC.toISOString(),
    });

    for (const unit of units) {
      try {
        // Use rawGet for range query on startsAt
        const appointments = await supabase.rawGet<Appointment>(
          `"Appointment"?unitId=eq.${unit.id}&and=(startsAt.gte.${todayStartUTC.toISOString()},startsAt.lte.${todayEndUTC.toISOString()})`,
        );

        const total = appointments.length;
        const completed = appointments.filter(
          (a) => a.status === "COMPLETED",
        ).length;
        const cancelled = appointments.filter(
          (a) => a.status === "CANCELLED" && a.retroReason !== "no-show",
        ).length;
        const noShow = appointments.filter(
          (a) => a.status === "CANCELLED" && a.retroReason === "no-show",
        ).length;
        const confirmed = appointments.filter(
          (a) => a.status === "CONFIRMED",
        ).length;
        const pending = appointments.filter(
          (a) => a.status === "PENDING",
        ).length;

        const revenueRaw = appointments
          .filter((a) => a.status === "COMPLETED")
          .reduce((sum, a) => sum + (a.totalPrice ?? 0), 0);

        const stats: DailyStats = {
          unitName: unit.name,
          date: todayLabel,
          total,
          completed,
          cancelled,
          noShow,
          confirmed,
          pending,
          revenue: formatCurrency(revenueRaw),
          revenueRaw,
        };

        // Generate executive report via Claude
        const claudeResponse = await anthropic.createMessage({
          system:
            "Você é um assistente de relatórios para salões de beleza. Gere um relatório executivo conciso e profissional em português. Use emojis para torná-lo visualmente agradável no WhatsApp. Não use markdown.",
          messages: [
            {
              role: "user",
              content: JSON.stringify(stats),
            },
          ],
          max_tokens: 1024,
        });

        const reportText = extractText(claudeResponse);

        if (!unit.whatsappInstance || !unit.phone) {
          structuredLog("warn", "cron_relatorio_skip_no_instance", {
            unitId: unit.id,
          });
          continue;
        }

        const phone = normalizePhone(unit.phone);
        await evolution.sendText(unit.whatsappInstance, phone, reportText);

        reportsSent++;

        structuredLog("info", "cron_relatorio_sent", {
          unitId: unit.id,
          stats,
        });
      } catch (err) {
        errors++;
        structuredLog("error", "cron_relatorio_unit_error", {
          unitId: unit.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    structuredLog("error", "cron_relatorio_fatal", {
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

  structuredLog("info", "cron_relatorio_done", { processed: reportsSent, errors });

  return new Response(
    JSON.stringify({ success: true, processed: reportsSent, errors }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
