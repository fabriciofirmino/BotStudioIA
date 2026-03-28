/**
 * E2E Test: Full End-to-End Flow
 *
 * Tests the complete lifecycle of a customer interaction:
 * 1. Customer sends WhatsApp message → Agent responds
 * 2. Customer books appointment → Status is PENDING
 * 3. Confirmação cron runs → Status becomes CONFIRMED
 * 4. Lembrete cron runs → Customer receives reminder
 * 5. Customer doesn't show up → No-show cron marks CANCELLED
 * 6. Relatório cron generates daily report
 *
 * This test validates the entire system working together.
 *
 * Prerequisites:
 *  - ALL services running (wrangler dev, supabase functions serve)
 *  - All environment variables configured
 *  - Real or mocked external APIs
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  sendWebhook,
  buildEvolutionPayload,
  seedTestData,
  cleanupTestData,
  supabaseGet,
  supabaseUpdate,
  supabaseDelete,
  waitFor,
  type TestSeedData,
} from "./helpers";

const EDGE_FUNCTION_URL =
  process.env["EDGE_FUNCTION_URL"] ?? "http://localhost:54321/functions/v1";

const authHeader = {
  Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
};

describe("Full E2E Flow — Customer Lifecycle", () => {
  let seed: TestSeedData;

  beforeAll(async () => {
    seed = await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData(seed);
  });

  // -----------------------------------------------------------------------
  // Step 1: Customer initiates conversation
  // -----------------------------------------------------------------------

  it("Step 1: Customer sends greeting via WhatsApp", async () => {
    const payload = buildEvolutionPayload({
      senderPhone: "5511988880000",
      destinationNumber: "5511999990000",
      message: "Oi, boa tarde! Gostaria de agendar um corte",
      pushName: "Carlos Teste",
      instance: "test-instance-e2e",
    });

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toHaveProperty("success", true);
  });

  // -----------------------------------------------------------------------
  // Step 2: Customer books appointment
  // -----------------------------------------------------------------------

  it("Step 2: Customer books an appointment", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    const payload = buildEvolutionPayload({
      senderPhone: "5511988880000",
      destinationNumber: "5511999990000",
      message: `Quero agendar Corte Masculino para ${dateStr} às 10:00 com João Barbeiro, meu nome é Carlos Teste`,
      pushName: "Carlos Teste",
      instance: "test-instance-e2e",
    });

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    // Wait for appointment to appear in DB
    const appointments = await waitFor(
      () =>
        supabaseGet<{ id: string; status: string }>("Appointment", {
          filters: `unitId=eq.${seed.unitId}`,
        }),
      (appts) => appts.length > 0,
      { timeoutMs: 20_000 }
    );

    expect(appointments.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Step 3: Confirmação cron processes pending appointments
  // -----------------------------------------------------------------------

  it("Step 3: Confirmação cron confirms pending appointments", async () => {
    // Ensure at least one appointment is PENDING
    const pending = await supabaseGet<{ id: string }>("Appointment", {
      filters: `unitId=eq.${seed.unitId}&status=eq.PENDING`,
    });

    // If the agent created it as CONFIRMED directly, set one to PENDING for test
    if (pending.length === 0) {
      const all = await supabaseGet<{ id: string }>("Appointment", {
        filters: `unitId=eq.${seed.unitId}`,
      });
      if (all.length > 0 && all[0]) {
        await supabaseUpdate("Appointment", `id=eq.${all[0].id}`, {
          status: "PENDING",
        });
      }
    }

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-confirmacao`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);

    // Verify CONFIRMED
    const confirmed = await waitFor(
      () =>
        supabaseGet<{ status: string }>("Appointment", {
          filters: `unitId=eq.${seed.unitId}&status=eq.CONFIRMED`,
        }),
      (appts) => appts.length > 0,
      { timeoutMs: 10_000 }
    );

    expect(confirmed.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Step 4: Lembrete cron sends reminders for tomorrow
  // -----------------------------------------------------------------------

  it("Step 4: Lembrete cron sends reminder for tomorrow's appointment", async () => {
    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-lembretes`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    // Tomorrow's CONFIRMED appointments should get reminders
  });

  // -----------------------------------------------------------------------
  // Step 5: Simulate no-show scenario
  // -----------------------------------------------------------------------

  it("Step 5: No-show cron handles missed appointments", async () => {
    // Move an appointment's endsAt to >30min ago to simulate no-show
    const appointments = await supabaseGet<{ id: string }>("Appointment", {
      filters: `unitId=eq.${seed.unitId}&status=eq.CONFIRMED`,
    });

    if (appointments.length > 0 && appointments[0]) {
      const pastEnd = new Date();
      pastEnd.setMinutes(pastEnd.getMinutes() - 45);
      const pastStart = new Date(pastEnd.getTime() - 30 * 60 * 1000);

      await supabaseUpdate("Appointment", `id=eq.${appointments[0].id}`, {
        startsAt: pastStart.toISOString(),
        endsAt: pastEnd.toISOString(),
      });
    }

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-noshow`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);

    // Verify no-show was marked
    const noShows = await supabaseGet<{ retroReason: string }>("Appointment", {
      filters: `unitId=eq.${seed.unitId}&retroReason=eq.no-show`,
    });

    expect(noShows.length).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Step 6: Daily report generation
  // -----------------------------------------------------------------------

  it("Step 6: Relatório cron generates daily report", async () => {
    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-relatorio`, {
      method: "POST",
      headers: authHeader,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBeGreaterThanOrEqual(1);
  });

  // -----------------------------------------------------------------------
  // Cleanup verification
  // -----------------------------------------------------------------------

  it("Step 7: Verify final state consistency", async () => {
    const allAppts = await supabaseGet<{
      id: string;
      status: string;
      retroReason: string | null;
    }>("Appointment", {
      filters: `unitId=eq.${seed.unitId}`,
    });

    // Every appointment should have a valid status
    for (const appt of allAppts) {
      expect(["CONFIRMED", "PENDING", "COMPLETED", "CANCELLED"]).toContain(
        appt.status
      );

      // No-show appointments should have retroReason
      if (appt.retroReason === "no-show") {
        expect(appt.status).toBe("CANCELLED");
      }
    }
  });
});
