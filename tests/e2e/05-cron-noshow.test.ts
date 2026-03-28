/**
 * E2E Test: Cron No-Show
 *
 * Tests the no-show detection cron that:
 * 1. Finds CONFIRMED appointments where endsAt < NOW() - 30min
 * 2. Updates status to CANCELLED with retroReason = 'no-show'
 * 3. Sends rescheduling offer via WhatsApp
 *
 * Prerequisites:
 *  - Edge function running: `supabase functions serve edge-cron-noshow`
 *  - Supabase with seed data
 *  - Evolution API (mock recommended)
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

describe("Cron — No-Show", () => {
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

  it("marks overdue CONFIRMED appointments as no-show", async () => {
    // Create an appointment that ended >30min ago
    const pastEnd = new Date();
    pastEnd.setMinutes(pastEnd.getMinutes() - 45); // 45min ago
    const pastStart = new Date(pastEnd.getTime() - 30 * 60 * 1000);

    await supabaseInsert("Appointment", {
      unitId: seed.unitId,
      clientId: seed.clientId,
      professionalId: seed.professionalId,
      serviceId: seed.serviceId,
      startsAt: pastStart.toISOString(),
      endsAt: pastEnd.toISOString(),
      status: "CONFIRMED",
      entryMode: "SCHEDULED",
      totalPrice: 50.0,
    });

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-noshow`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(1);

    // Verify status changed to CANCELLED with no-show reason
    const cancelled = await waitFor(
      () =>
        supabaseGet<{ status: string; retroReason: string }>("Appointment", {
          filters: `unitId=eq.${seed.unitId}&status=eq.CANCELLED`,
        }),
      (appts) => appts.length > 0,
      { timeoutMs: 10_000 }
    );

    expect(cancelled[0]?.status).toBe("CANCELLED");
    expect(cancelled[0]?.retroReason).toBe("no-show");
  });

  it("does NOT mark appointments still within the grace period", async () => {
    // Appointment ended only 15 min ago (within 30min grace)
    const recentEnd = new Date();
    recentEnd.setMinutes(recentEnd.getMinutes() - 15);
    const recentStart = new Date(recentEnd.getTime() - 30 * 60 * 1000);

    await supabaseInsert("Appointment", {
      unitId: seed.unitId,
      clientId: seed.clientId,
      professionalId: seed.professionalId,
      serviceId: seed.serviceId,
      startsAt: recentStart.toISOString(),
      endsAt: recentEnd.toISOString(),
      status: "CONFIRMED",
      entryMode: "SCHEDULED",
      totalPrice: 50.0,
    });

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-noshow`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(0);
  });

  it("does NOT affect COMPLETED appointments", async () => {
    const pastEnd = new Date();
    pastEnd.setMinutes(pastEnd.getMinutes() - 60);
    const pastStart = new Date(pastEnd.getTime() - 30 * 60 * 1000);

    await supabaseInsert("Appointment", {
      unitId: seed.unitId,
      clientId: seed.clientId,
      professionalId: seed.professionalId,
      serviceId: seed.serviceId,
      startsAt: pastStart.toISOString(),
      endsAt: pastEnd.toISOString(),
      status: "COMPLETED",
      entryMode: "SCHEDULED",
      totalPrice: 50.0,
    });

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-noshow`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(0);
  });

  it("handles multiple no-show appointments at once", async () => {
    const pastEnd = new Date();
    pastEnd.setMinutes(pastEnd.getMinutes() - 60);
    const pastStart = new Date(pastEnd.getTime() - 30 * 60 * 1000);

    // Create 3 overdue appointments
    for (let i = 0; i < 3; i++) {
      await supabaseInsert("Appointment", {
        unitId: seed.unitId,
        clientId: seed.clientId,
        professionalId: seed.professionalId,
        serviceId: seed.serviceId,
        startsAt: new Date(pastStart.getTime() - i * 60 * 60 * 1000).toISOString(),
        endsAt: new Date(pastEnd.getTime() - i * 60 * 60 * 1000).toISOString(),
        status: "CONFIRMED",
        entryMode: "SCHEDULED",
        totalPrice: 50.0,
      });
    }

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-noshow`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(3);
  });
});
