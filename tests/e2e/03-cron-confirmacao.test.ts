/**
 * E2E Test: Cron Confirmação
 *
 * Tests the hourly confirmation cron that:
 * 1. Finds PENDING appointments
 * 2. Sends confirmation WhatsApp messages
 * 3. Updates status to CONFIRMED
 *
 * Prerequisites:
 *  - Edge function running: `supabase functions serve edge-cron-confirmacao`
 *  - Supabase with seed data
 *  - WAHA (mock recommended)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  seedTestData,
  cleanupTestData,
  supabaseInsert,
  supabaseGet,
  supabaseDelete,
  waitFor,
  type TestSeedData,
} from "./helpers";

const EDGE_FUNCTION_URL =
  process.env["EDGE_FUNCTION_URL"] ?? "http://localhost:54321/functions/v1";

describe("Cron — Confirmação", () => {
  let seed: TestSeedData;

  beforeAll(async () => {
    seed = await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData(seed);
  });

  beforeEach(async () => {
    // Clean up test appointments
    await supabaseDelete("Appointment", `unitId=eq.${seed.unitId}`).catch(
      () => {}
    );
  });

  it("confirms PENDING appointments and sends WhatsApp message", async () => {
    // Create a PENDING appointment
    const startsAt = new Date();
    startsAt.setHours(startsAt.getHours() + 2);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

    await supabaseInsert("Appointment", {
      unitId: seed.unitId,
      clientId: seed.clientId,
      professionalId: seed.professionalId,
      serviceId: seed.serviceId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "PENDING",
      entryMode: "SCHEDULED",
      totalPrice: 50.0,
    });

    // Trigger the cron function
    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-confirmacao`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBeGreaterThanOrEqual(1);

    // Verify appointment status changed to CONFIRMED
    const confirmed = await waitFor(
      () =>
        supabaseGet<{ status: string }>("Appointment", {
          filters: `unitId=eq.${seed.unitId}&status=eq.CONFIRMED`,
        }),
      (appts) => appts.length > 0,
      { timeoutMs: 10_000 }
    );

    expect(confirmed.length).toBe(1);
  });

  it("skips appointments that are already CONFIRMED", async () => {
    const startsAt = new Date();
    startsAt.setHours(startsAt.getHours() + 2);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);

    await supabaseInsert("Appointment", {
      unitId: seed.unitId,
      clientId: seed.clientId,
      professionalId: seed.professionalId,
      serviceId: seed.serviceId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "CONFIRMED",
      entryMode: "SCHEDULED",
      totalPrice: 50.0,
    });

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-confirmacao`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(0);
  });

  it("handles no pending appointments gracefully", async () => {
    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-confirmacao`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(0);
  });
});
