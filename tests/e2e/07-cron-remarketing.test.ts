/**
 * E2E Test: Cron Remarketing
 *
 * Tests the daily remarketing cron that:
 * 1. Finds ACTIVE marketing campaigns
 * 2. Matches clients to campaign audiences
 * 3. Uses Claude to personalize messages
 * 4. Sends via WhatsApp with 3s delay between messages
 *
 * Prerequisites:
 *  - Edge function running: `supabase functions serve edge-cron-remarketing`
 *  - Supabase with seed data + marketing data
 *  - Anthropic API key
 *  - Evolution API (mock recommended)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  seedTestData,
  cleanupTestData,
  supabaseInsert,
  supabaseGet,
  supabaseDelete,
  type TestSeedData,
} from "./helpers";

const EDGE_FUNCTION_URL =
  process.env["EDGE_FUNCTION_URL"] ?? "http://localhost:54321/functions/v1";

describe("Cron — Remarketing", () => {
  let seed: TestSeedData;
  let audienceId: string;
  let campaignId: string;

  beforeAll(async () => {
    seed = await seedTestData();

    // Create audience
    const audience = await supabaseInsert<{ id: string }>(
      "MarketingAudience",
      {
        unitId: seed.unitId,
        name: "Clientes frequentes",
        description: "Clientes que visitam regularmente",
        channelHint: "whatsapp",
        active: true,
      }
    );
    audienceId = audience.id;

    // Link client to audience
    await supabaseInsert("Client", {
      name: "Maria Remarketing",
      phone: "5511977770000",
      unitId: seed.unitId,
      marketingAudienceId: audienceId,
      tags: ["frequente", "corte"],
      notes: "Cliente VIP, prefere horário da manhã",
    }).catch(() => {
      // If client already exists, that's fine
    });
  });

  afterAll(async () => {
    await supabaseDelete("MarketingCampaign", `unitId=eq.${seed.unitId}`).catch(
      () => {}
    );
    await supabaseDelete("MarketingAudience", `unitId=eq.${seed.unitId}`).catch(
      () => {}
    );
    await cleanupTestData(seed);
  });

  beforeEach(async () => {
    await supabaseDelete("MarketingCampaign", `unitId=eq.${seed.unitId}`).catch(
      () => {}
    );
  });

  it("sends personalized marketing messages for ACTIVE campaigns", async () => {
    // Create an active campaign
    const campaign = await supabaseInsert<{ id: string }>(
      "MarketingCampaign",
      {
        unitId: seed.unitId,
        name: "Promoção de Verão",
        objective: "Reativar clientes frequentes",
        channel: "whatsapp",
        message:
          "Aproveite nossa promoção especial! 20% de desconto em todos os serviços esta semana.",
        status: "ACTIVE",
        audienceId: audienceId,
        audienceLabel: "Clientes frequentes",
      }
    );
    campaignId = campaign.id;

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-remarketing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      processed: number;
      messagesSent: number;
    };
    expect(body.processed).toBeGreaterThanOrEqual(1);
  });

  it("skips DRAFT and PAUSED campaigns", async () => {
    await supabaseInsert("MarketingCampaign", {
      unitId: seed.unitId,
      name: "Campanha Draft",
      objective: "Teste",
      channel: "whatsapp",
      message: "Mensagem draft",
      status: "DRAFT",
      audienceId: audienceId,
      audienceLabel: "Clientes frequentes",
    });

    await supabaseInsert("MarketingCampaign", {
      unitId: seed.unitId,
      name: "Campanha Pausada",
      objective: "Teste",
      channel: "whatsapp",
      message: "Mensagem pausada",
      status: "PAUSED",
      audienceId: audienceId,
      audienceLabel: "Clientes frequentes",
    });

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-remarketing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(0);
  });

  it("handles campaigns with no matching clients gracefully", async () => {
    // Create audience with no clients
    const emptyAudience = await supabaseInsert<{ id: string }>(
      "MarketingAudience",
      {
        unitId: seed.unitId,
        name: "Audiência vazia",
        description: "Nenhum cliente",
        channelHint: "whatsapp",
        active: true,
      }
    );

    await supabaseInsert("MarketingCampaign", {
      unitId: seed.unitId,
      name: "Campanha sem público",
      objective: "Teste",
      channel: "whatsapp",
      message: "Mensagem",
      status: "ACTIVE",
      audienceId: emptyAudience.id,
      audienceLabel: "Audiência vazia",
    });

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-remarketing`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    // Should process campaign but send 0 messages
    const body = (await res.json()) as {
      processed: number;
      messagesSent: number;
    };
    expect(body.processed).toBeGreaterThanOrEqual(1);
    expect(body.messagesSent).toBe(0);

    // Cleanup
    await supabaseDelete(
      "MarketingAudience",
      `id=eq.${emptyAudience.id}`
    ).catch(() => {});
  });
});
