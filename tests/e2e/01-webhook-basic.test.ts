/**
 * E2E Test: WhatsApp Webhook — Basic Flow
 *
 * Prerequisites:
 *  - `wrangler dev` running on localhost:8787
 *  - Supabase local or remote with seed data
 *  - Evolution API mock or real instance
 *
 * Tests the fundamental webhook behavior: HMAC validation,
 * message filtering, unit resolution, and response flow.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  TEST_CONFIG,
  sendWebhook,
  buildEvolutionPayload,
  computeHmac,
  seedTestData,
  cleanupTestData,
  type TestSeedData,
} from "./helpers";

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
      buildEvolutionPayload({
        senderPhone: "5511988880000",
        destinationNumber: "5511999990000",
        message: "Olá",
        pushName: "Carlos",
        instance: "test-instance-e2e",
      })
    );

    const res = await fetch(`${TEST_CONFIG.workerUrl}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    expect(res.status).toBe(401);
  });

  it("rejects requests with invalid HMAC signature", async () => {
    const payload = buildEvolutionPayload({
      senderPhone: "5511988880000",
      destinationNumber: "5511999990000",
      message: "Olá",
      pushName: "Carlos",
      instance: "test-instance-e2e",
    });

    const body = JSON.stringify(payload);
    const res = await fetch(`${TEST_CONFIG.workerUrl}/webhook`, {
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
    const payload = buildEvolutionPayload({
      senderPhone: "5511988880000",
      destinationNumber: "5511999990000",
      message: "Olá",
      pushName: "Carlos",
      instance: "test-instance-e2e",
    });

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);
  });

  // -----------------------------------------------------------------------
  // Message Filtering
  // -----------------------------------------------------------------------

  it("ignores group messages (@g.us)", async () => {
    const payload = buildEvolutionPayload({
      senderPhone: "5511988880000",
      destinationNumber: "5511999990000",
      message: "Mensagem de grupo",
      pushName: "Carlos",
      instance: "test-instance-e2e",
      isGroup: true,
    });

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ignored", true);
  });

  it("ignores fromMe messages", async () => {
    const payload = buildEvolutionPayload({
      senderPhone: "5511988880000",
      destinationNumber: "5511999990000",
      message: "Minha própria mensagem",
      pushName: "Bot",
      instance: "test-instance-e2e",
      fromMe: true,
    });

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ignored", true);
  });

  // -----------------------------------------------------------------------
  // Unit Resolution
  // -----------------------------------------------------------------------

  it("returns 200 silently when unit is not found", async () => {
    const payload = buildEvolutionPayload({
      senderPhone: "5511988880000",
      destinationNumber: "5500000000000", // unknown number
      message: "Olá",
      pushName: "Carlos",
      instance: "unknown-instance",
    });

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ignored", true);
  });

  // -----------------------------------------------------------------------
  // Non-POST methods
  // -----------------------------------------------------------------------

  it("returns 405 for GET requests", async () => {
    const res = await fetch(`${TEST_CONFIG.workerUrl}/webhook`, {
      method: "GET",
    });
    expect(res.status).toBe(405);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`${TEST_CONFIG.workerUrl}/unknown`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});
