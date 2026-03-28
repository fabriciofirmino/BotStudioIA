/**
 * E2E Test: Cron Lembretes
 *
 * Tests the daily reminder cron that:
 * 1. Finds CONFIRMED appointments for tomorrow
 * 2. Sends reminder WhatsApp messages (with aiPolicies.confirmation if available)
 *
 * Prerequisites:
 *  - Edge function running: `supabase functions serve edge-cron-lembretes`
 *  - Supabase with seed data
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

describe("Cron — Lembretes", () => {
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

  it("sends reminders for tomorrow's CONFIRMED appointments", async () => {
    // Create a CONFIRMED appointment for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);
    const endsAt = new Date(tomorrow.getTime() + 30 * 60 * 1000);

    await supabaseInsert("Appointment", {
      unitId: seed.unitId,
      clientId: seed.clientId,
      professionalId: seed.professionalId,
      serviceId: seed.serviceId,
      startsAt: tomorrow.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "CONFIRMED",
      entryMode: "SCHEDULED",
      totalPrice: 50.0,
    });

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-lembretes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(1);
  });

  it("does NOT send reminders for today's appointments", async () => {
    // Create a CONFIRMED appointment for today (not tomorrow)
    const today = new Date();
    today.setHours(today.getHours() + 2);
    const endsAt = new Date(today.getTime() + 30 * 60 * 1000);

    await supabaseInsert("Appointment", {
      unitId: seed.unitId,
      clientId: seed.clientId,
      professionalId: seed.professionalId,
      serviceId: seed.serviceId,
      startsAt: today.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "CONFIRMED",
      entryMode: "SCHEDULED",
      totalPrice: 50.0,
    });

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-lembretes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-key"}`,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { processed: number };
    expect(body.processed).toBe(0);
  });

  it("does NOT send reminders for CANCELLED appointments", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 0, 0, 0);
    const endsAt = new Date(tomorrow.getTime() + 30 * 60 * 1000);

    await supabaseInsert("Appointment", {
      unitId: seed.unitId,
      clientId: seed.clientId,
      professionalId: seed.professionalId,
      serviceId: seed.serviceId,
      startsAt: tomorrow.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "CANCELLED",
      entryMode: "SCHEDULED",
      totalPrice: 50.0,
    });

    const res = await fetch(`${EDGE_FUNCTION_URL}/edge-cron-lembretes`, {
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
