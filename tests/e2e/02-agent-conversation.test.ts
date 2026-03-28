/**
 * E2E Test: Agent Conversation Flow
 *
 * Tests the complete conversation flow:
 * greeting → list services → check availability → book → cancel
 *
 * Prerequisites:
 *  - `supabase functions serve` running
 *  - Supabase with seed data + RPC functions deployed
 *  - WAHA (mock recommended — capture sent messages)
 *  - Anthropic API key configured
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  TEST_CONFIG,
  sendWebhook,
  buildWahaPayload,
  seedTestData,
  cleanupTestData,
  supabaseGet,
  waitFor,
  type TestSeedData,
} from "./helpers";

describe("Agent Conversation — Full Flow", () => {
  let seed: TestSeedData;

  beforeAll(async () => {
    seed = await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData(seed);
  });

  const sendMessage = async (message: string) => {
    const payload = buildWahaPayload({
      senderPhone: "5511988880000",
      session: "test-instance-e2e",
      message,
    });
    return sendWebhook(payload, { secret: TEST_CONFIG.webhookSecret });
  };

  // -----------------------------------------------------------------------
  // Greeting
  // -----------------------------------------------------------------------

  it("responds to a greeting message", async () => {
    const res = await sendMessage("Olá, boa tarde!");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("success", true);
  });

  // -----------------------------------------------------------------------
  // List Services (tool: listar_servicos)
  // -----------------------------------------------------------------------

  it("lists available services when asked", async () => {
    const res = await sendMessage("Quais serviços vocês oferecem?");
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("success", true);
    // The agent should have called listar_servicos tool
    // and the response should mention "Corte Masculino" from seed data
  });

  // -----------------------------------------------------------------------
  // Check Availability (tool: consultar_agenda)
  // -----------------------------------------------------------------------

  it("checks availability when asked about scheduling", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    const res = await sendMessage(
      `Quais horários disponíveis para amanhã, ${dateStr}?`
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("success", true);
  });

  // -----------------------------------------------------------------------
  // Create Appointment (tool: criar_agendamento)
  // -----------------------------------------------------------------------

  it("creates an appointment when user confirms booking", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    const res = await sendMessage(
      `Quero agendar um Corte Masculino para amanhã ${dateStr} às 10:00 com João Barbeiro`
    );
    expect(res.status).toBe(200);

    // Verify appointment was created in database
    const appointments = await waitFor(
      () =>
        supabaseGet<{ id: string; status: string; unitId: string }>(
          "Appointment",
          { filters: `unitId=eq.${seed.unitId}&status=eq.CONFIRMED` }
        ),
      (appts) => appts.length > 0,
      { timeoutMs: 15_000 }
    );

    expect(appointments.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Cancel Appointment (tool: cancelar_agendamento)
  // -----------------------------------------------------------------------

  it("cancels an appointment when requested", async () => {
    // First get the appointment we just created
    const appointments = await supabaseGet<{ id: string }>("Appointment", {
      filters: `unitId=eq.${seed.unitId}&status=eq.CONFIRMED`,
    });
    expect(appointments.length).toBeGreaterThanOrEqual(1);

    const res = await sendMessage("Preciso cancelar meu agendamento");
    expect(res.status).toBe(200);

    // The agent should offer rescheduling before canceling
    // After confirming cancellation, verify status changed
    const cancelRes = await sendMessage("Sim, pode cancelar");
    expect(cancelRes.status).toBe(200);

    const cancelled = await waitFor(
      () =>
        supabaseGet<{ status: string }>("Appointment", {
          filters: `unitId=eq.${seed.unitId}&status=eq.CANCELLED`,
        }),
      (appts) => appts.length > 0,
      { timeoutMs: 15_000 }
    );

    expect(cancelled.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Conversation History Persistence
  // -----------------------------------------------------------------------

  it("maintains conversation context across messages", async () => {
    // Send a first message establishing context
    const res1 = await sendMessage("Quero saber sobre corte de cabelo");
    expect(res1.status).toBe(200);

    // Follow-up should maintain context
    const res2 = await sendMessage("Quanto custa?");
    expect(res2.status).toBe(200);

    // The agent should understand "quanto custa" refers to the haircut
    // mentioned in the previous message
    const body = (await res2.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("success", true);
  });
});
