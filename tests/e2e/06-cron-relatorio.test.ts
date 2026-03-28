/**
 * E2E Test: Cron Relatório
 *
 * Tests the daily report cron that:
 * 1. Queries all Units with aiEnabled = true
 * 2. Aggregates today's appointments into stats
 * 3. Uses Claude to generate executive report
 * 4. Sends report via WhatsApp to unit admin
 *
 * Prerequisites:
 *  - Edge function running: `supabase functions serve edge-cron-relatorio`
 *  - Supabase with seed data
 *  - Anthropic API key
 *  - Evolution API (mock recommended)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  seedTestData,
  cleanupTestData,
  supabaseInsert,
  supabaseDelete,
  type TestSeedData,
} from "./helpers";

const EDGE_FUNCTION_URL =
  process.env["EDGE_FUNCTION_URL"] ?? "http://localhost:54321/functions/v1";

describe("Cron — Relatório", () => {
  let seed: TestSeedData;

  beforeAll(async () => {
    seed = await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData(seed);
  });

  beforeEach(async () => {
    await supabaseDelete("Appointment", `unitId=eq.${seed.unitId}`).catch(
      () => {}
    );
  });

  it("generates and sends daily report for units with aiEnabled", async () => {
    const today = new Date();

    // Create some appointments for today with different statuses
    const baseTime = new Date(today);
    baseTime.setHours(9, 0, 0, 0);

    const appointments = [
      { status: "COMPLETED", hour: 9, price: 50 },
      { status: "COMPLETED", hour: 10, price: 80 },
      { status: "CONFIRMED", hour: 14, price: 50 },
      { status: "CANCELLED", hour: 11, price: 60 },
    ];

    for (const appt of appointments) {
      const startsAt = new Date(baseTime);
      startsAt.setHours(appt.hour);
      const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

      await supabaseInsert("Appointment", {
        unitId: seed.unitId,
        clientId: seed.clientId,
        professionalId: seed.professionalId,
        serviceId: seed.serviceId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        status: appt.status,
        entryMode: "SCHEDULED",
        totalPrice: appt.price,
      });
    }

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-relatorio`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBeGreaterThanOrEqual(1);
  });

  it("handles units with no appointments today", async () => {
    // No appointments created — should still generate report (with zeros)
    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-relatorio`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    // At least our test unit should be processed (aiEnabled = true)
    expect(body.processed).toBeGreaterThanOrEqual(1);
  });
});
