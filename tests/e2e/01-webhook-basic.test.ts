/**
 * E2E Test: WhatsApp Webhook — Basic Flow
 *
 * Prerequisites:
 *  - `supabase functions serve` running
 *  - Supabase local or remote with seed data
 *  - WAHA mock or real instance
 *
 * Tests the fundamental webhook behavior: HMAC validation,
 * message filtering, unit resolution, and response flow.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  TEST_CONFIG,
  sendWebhook,
  buildWahaPayload,
  computeHmac,
  seedTestData,
  cleanupTestData,
  type TestSeedData,
} from "./helpers";

const WEBHOOK_URL = `${TEST_CONFIG.edgeFunctionUrl}/edge-whatsapp-webhook`;

describe("Webhook — Basic Flow", () => {
  let seed: TestSeedData;

  beforeAll(async () => {
    seed = await seedTestData();
  });

  afterAll(async () => {
    await cleanupTestData(seed);
  });

  // -----------------------------------------------------------------------
  // HMAC Validation
  // -----------------------------------------------------------------------

  it("rejects requests without HMAC signature", async () => {
    const body = JSON.stringify(
      buildWahaPayload({
        senderPhone: "5511988880000",
        session: "test-instance-e2e",
        message: "Olá",
      })
    );

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    expect(res.status).toBe(401);
  });

  it("rejects requests with invalid HMAC signature", async () => {
    const payload = buildWahaPayload({
      senderPhone: "5511988880000",
      session: "test-instance-e2e",
      message: "Olá",
    });

    const body = JSON.stringify(payload);
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": "sha256=invalid_signature",
      },
      body,
    });

    expect(res.status).toBe(401);
  });

  it("accepts requests with valid HMAC signature", async () => {
    const payload = buildWahaPayload({
      senderPhone: "5511988880000",
      session: "test-instance-e2e",
      message: "Olá",
    });

    const res = await sendWebhook(payload, { secret: TEST_CONFIG.webhookSecret });
    expect(res.status).toBe(200);
  });

  // -----------------------------------------------------------------------
  // Message Filtering
  // -----------------------------------------------------------------------

  it("ignores group messages (@g.us)", async () => {
    const payload = buildWahaPayload({
      senderPhone: "5511988880000",
      session: "test-instance-e2e",
      message: "Mensagem de grupo",
      isGroup: true,
    });

    const res = await sendWebhook(payload, { secret: TEST_CONFIG.webhookSecret });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ignored", true);
  });

  it("ignores fromMe messages", async () => {
    const payload = buildWahaPayload({
      senderPhone: "5511988880000",
      session: "test-instance-e2e",
      message: "Minha própria mensagem",
      fromMe: true,
    });

    const res = await sendWebhook(payload, { secret: TEST_CONFIG.webhookSecret });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ignored", true);
  });

  // -----------------------------------------------------------------------
  // Unit Resolution
  // -----------------------------------------------------------------------

  it("returns 200 silently when unit is not found", async () => {
    const payload = buildWahaPayload({
      senderPhone: "5511988880000",
      session: "unknown-instance",
      message: "Olá",
    });

    const res = await sendWebhook(payload, { secret: TEST_CONFIG.webhookSecret });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ignored", true);
  });

  // -----------------------------------------------------------------------
  // Non-POST methods
  // -----------------------------------------------------------------------

  it("returns 405 for GET requests", async () => {
    const res = await fetch(WEBHOOK_URL, {
      method: "GET",
    });
    expect(res.status).toBe(405);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`${TEST_CONFIG.edgeFunctionUrl}/unknown-route`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});
