import {
  SupabaseClient,
  WahaClient,
  AnthropicClient,
  extractText,
  structuredLog,
  normalizePhone,
  sleep,
} from "../../packages/studioflow-sdk/src/index.ts";
import type {
  MarketingCampaign,
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

  const anthropic = new AnthropicClient({
    apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
  });

  let messagesSent = 0;
  let errors = 0;
  let campaignCount = 0;

  try {
    const campaigns = await supabase.query<MarketingCampaign>(
      "MarketingCampaign",
      {
        filters: { status: "eq.ACTIVE" },
      },
    );

    campaignCount = campaigns.length;

    structuredLog("info", "cron_remarketing_start", {
      campaignCount,
    });

    for (const campaign of campaigns) {
      try {
        const units = await supabase.query<Unit>("Unit", {
          filters: { id: `eq.${campaign.unitId}` },
          limit: 1,
        });

        const unit = units[0];

        if (!unit) {
          structuredLog("warn", "cron_remarketing_skip_no_unit", {
            campaignId: campaign.id,
            unitId: campaign.unitId,
          });
          continue;
        }

        if (!unit.whatsappInstance) {
          structuredLog("warn", "cron_remarketing_skip_no_instance", {
            unitId: unit.id,
            campaignId: campaign.id,
          });
          continue;
        }

        // Build client filters based on audience
        const clientFilters: Record<string, string> = {
          unitId: `eq.${campaign.unitId}`,
        };
        if (campaign.audienceId) {
          clientFilters["marketingAudienceId"] = `eq.${campaign.audienceId}`;
        }

        const clients = await supabase.query<Client>("Client", {
          filters: clientFilters,
        });

        structuredLog("info", "cron_remarketing_campaign_clients", {
          campaignId: campaign.id,
          clientCount: clients.length,
        });

        const aiTone = unit.aiTone ?? "profissional e amigável";

        for (const client of clients) {
          try {
            const tagsStr = client.tags?.join(", ") ?? "nenhuma";
            const notesStr = client.notes ?? "nenhuma";

            const claudeResponse = await anthropic.createMessage({
              system: `Personalize a mensagem de marketing abaixo para o cliente. Mantenha o tom ${aiTone}. Seja breve e direto. Retorne apenas a mensagem personalizada, sem explicações adicionais.`,
              messages: [
                {
                  role: "user",
                  content: [
                    `Mensagem base: ${campaign.message}`,
                    `Cliente: ${client.name}`,
                    `Tags: ${tagsStr}`,
                    `Notas: ${notesStr}`,
                    `Estabelecimento: ${unit.name}`,
                    `Segmento: ${unit.segment}`,
                  ].join("\n"),
                },
              ],
              max_tokens: 512,
            });

            const personalizedMessage = extractText(claudeResponse);

            const phone = normalizePhone(client.phone);
            await waha.sendText(
              unit.whatsappInstance,
              phone,
              personalizedMessage,
            );

            messagesSent++;

            structuredLog("info", "cron_remarketing_sent", {
              campaignId: campaign.id,
              clientId: client.id,
              phone,
            });

            // Anti-spam delay: 3 seconds between messages
            await sleep(3000);
          } catch (err) {
            errors++;
            structuredLog("error", "cron_remarketing_client_error", {
              campaignId: campaign.id,
              clientId: client.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (err) {
        errors++;
        structuredLog("error", "cron_remarketing_campaign_error", {
          campaignId: campaign.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    structuredLog("error", "cron_remarketing_fatal", {
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

  structuredLog("info", "cron_remarketing_done", { processed: campaignCount, messagesSent, errors });

  return new Response(
    JSON.stringify({ success: true, processed: campaignCount, messagesSent, errors }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
