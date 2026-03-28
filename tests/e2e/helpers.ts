/**
 * E2E test helpers — shared utilities for integration tests.
 *
 * These tests hit real (or local) services:
 * - Supabase (can use local via `supabase start`)
 * - WAHA (WhatsApp HTTP API) — mock server or real
 * - Supabase Edge Functions (via `supabase functions serve`)
 */

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

export const TEST_CONFIG = {
  edgeFunctionUrl: process.env["EDGE_FUNCTION_URL"] ?? "http://localhost:54321/functions/v1",
  supabaseUrl: process.env["SUPABASE_URL"] ?? "http://localhost:54321",
  supabaseKey: process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "test-service-role-key",
  wahaApiUrl: process.env["WAHA_API_URL"] ?? "http://localhost:3000",
  wahaApiKey: process.env["WAHA_API_KEY"] ?? "test-waha-key",
  webhookSecret: process.env["WEBHOOK_SECRET"] ?? "test-webhook-secret",
} as const;

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

interface SupabaseQueryOptions {
  select?: string;
  filters?: string;
}

export async function supabaseGet<T>(
  table: string,
  options: SupabaseQueryOptions = {}
): Promise<T[]> {
  const params = new URLSearchParams();
  if (options.select) params.set("select", options.select);

  const filterStr = options.filters ? `&${options.filters}` : "";
  const url = `${TEST_CONFIG.supabaseUrl}/rest/v1/${table}?${params.toString()}${filterStr}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TEST_CONFIG.supabaseKey}`,
      apikey: TEST_CONFIG.supabaseKey,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  if (!res.ok) throw new Error(`Supabase GET ${table} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

export async function supabaseInsert<T>(
  table: string,
  data: Record<string, unknown>
): Promise<T> {
  const url = `${TEST_CONFIG.supabaseUrl}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_CONFIG.supabaseKey}`,
      apikey: TEST_CONFIG.supabaseKey,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase INSERT ${table} failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as T[];
  const first = rows[0];
  if (!first) throw new Error(`Supabase INSERT ${table} returned no rows`);
  return first;
}

export async function supabaseUpdate<T>(
  table: string,
  filters: string,
  data: Record<string, unknown>
): Promise<T[]> {
  const url = `${TEST_CONFIG.supabaseUrl}/rest/v1/${table}?${filters}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${TEST_CONFIG.supabaseKey}`,
      apikey: TEST_CONFIG.supabaseKey,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase UPDATE ${table} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

export async function supabaseDelete(table: string, filters: string): Promise<void> {
  const url = `${TEST_CONFIG.supabaseUrl}/rest/v1/${table}?${filters}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${TEST_CONFIG.supabaseKey}`,
      apikey: TEST_CONFIG.supabaseKey,
    },
  });
  if (!res.ok) throw new Error(`Supabase DELETE ${table} failed: ${res.status} ${await res.text()}`);
}

export async function supabaseRpc<T>(
  fn: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const url = `${TEST_CONFIG.supabaseUrl}/rest/v1/rpc/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TEST_CONFIG.supabaseKey}`,
      apikey: TEST_CONFIG.supabaseKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Supabase RPC ${fn} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

export function buildWahaPayload(params: {
  senderPhone: string;
  session: string;
  message: string;
  fromMe?: boolean;
  isGroup?: boolean;
}): Record<string, unknown> {
  const from = params.isGroup
    ? `120363000000000000@g.us`
    : `${params.senderPhone}@c.us`;

  return {
    id: `TEST_${Date.now()}`,
    timestamp: Date.now(),
    session: params.session,
    metadata: null,
    engine: "NOWEB",
    me: { id: `${params.senderPhone}@c.us`, pushName: "Bot" },
    event: "message",
    payload: {
      id: `true_${params.senderPhone}@c.us_TEST${Date.now()}`,
      timestamp: Math.floor(Date.now() / 1000),
      from,
      fromMe: params.fromMe ?? false,
      to: "bot@c.us",
      participant: params.isGroup ? `${params.senderPhone}@c.us` : null,
      body: params.message,
      hasMedia: false,
      media: null,
      mediaUrl: "",
      ack: 0,
      ackName: "PENDING",
      source: "APP",
      author: null,
      replyTo: null,
      _data: {},
    },
  };
}

export async function sendWebhook(
  payload: Record<string, unknown>,
  options: { secret?: string } = {}
): Promise<Response> {
  const body = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // If a secret is provided, compute HMAC and attach it
  if (options.secret) {
    const signature = await computeHmac(options.secret, body);
    headers["x-hub-signature-256"] = signature;
  }

  return fetch(`${TEST_CONFIG.edgeFunctionUrl}/edge-whatsapp-webhook`, {
    method: "POST",
    headers,
    body,
  });
}

export async function computeHmac(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

export interface TestSeedData {
  organizationId: string;
  unitId: string;
  professionalId: string;
  serviceId: string;
  clientId: string;
}

export async function seedTestData(): Promise<TestSeedData> {
  const org = await supabaseInsert<{ id: string }>("Organization", {
    name: "Test Org E2E",
    ownerEmail: "test@e2e.com",
  });

  const unit = await supabaseInsert<{ id: string }>("Unit", {
    organizationId: org.id,
    segment: "BARBERSHOP",
    name: "Test Unit E2E",
    phone: "5511999990000",
    ownerEmail: "test@e2e.com",
    whatsappInstance: "test-instance-e2e",
    whatsappNumber: "5511999990000",
    aiEnabled: true,
    aiTone: "profissional e amigável",
    aiSystemPrompt: "Você é o assistente virtual da barbearia Test Unit E2E.",
    aiGreeting: "Olá! Como posso ajudar?",
    aiFallback: "Desculpe, não entendi. Posso ajudar com agendamentos.",
    aiPolicies: { confirmation: "Confirme até 2h antes do horário." },
    setupCompleted: true,
  });

  const professional = await supabaseInsert<{ id: string }>("Professional", {
    name: "João Barbeiro",
    specialty: "Corte masculino",
    phone: "5511999991111",
    workStart: "09:00",
    workEnd: "18:00",
    workingDays: [1, 2, 3, 4, 5],
    isActive: true,
    unitId: unit.id,
  });

  const service = await supabaseInsert<{ id: string }>("Service", {
    name: "Corte Masculino",
    description: "Corte social ou degradê",
    durationMin: 30,
    price: 50.0,
    category: "Corte",
    isActive: true,
    unitId: unit.id,
  });

  const client = await supabaseInsert<{ id: string }>("Client", {
    name: "Carlos Teste",
    phone: "5511988880000",
    unitId: unit.id,
  });

  return {
    organizationId: org.id,
    unitId: unit.id,
    professionalId: professional.id,
    serviceId: service.id,
    clientId: client.id,
  };
}

export async function cleanupTestData(seed: TestSeedData): Promise<void> {
  // Delete in reverse dependency order
  await supabaseDelete("Appointment", `unitId=eq.${seed.unitId}`).catch(() => {});
  await supabaseDelete("Client", `unitId=eq.${seed.unitId}`).catch(() => {});
  await supabaseDelete("Service", `unitId=eq.${seed.unitId}`).catch(() => {});
  await supabaseDelete("Professional", `unitId=eq.${seed.unitId}`).catch(() => {});
  await supabaseDelete("Unit", `id=eq.${seed.unitId}`).catch(() => {});
  await supabaseDelete("Organization", `id=eq.${seed.organizationId}`).catch(() => {});
}

// ---------------------------------------------------------------------------
// Polling helper
// ---------------------------------------------------------------------------

export async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (val: T) => boolean,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<T> {
  const interval = options.intervalMs ?? 1000;
  const timeout = options.timeoutMs ?? 30_000;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const val = await fn();
    if (predicate(val)) return val;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}
