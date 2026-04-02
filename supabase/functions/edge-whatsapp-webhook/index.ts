// ─── Enums ───────────────────────────────────────────────────────────────────

export type UnitSegment = "BARBERSHOP" | "FACIAL_AESTHETICS" | "NAIL_STUDIO" | "BEAUTY_CLINIC";
export type AppointmentStatus = "CONFIRMED" | "PENDING" | "COMPLETED" | "CANCELLED";
export type EntryMode = "SCHEDULED" | "RETROACTIVE";
export type UserRole = "ADMIN" | "GERENTE" | "PROFISSIONAL" | "CLIENTE" | "ATENDIMENTO";
export type CampaignStatus = "DRAFT" | "ACTIVE" | "PAUSED";
export type CatalogDomain = "CLIENT_TAG" | "SERVICE_CATEGORY" | "PROFESSIONAL_SPECIALTY" | "UNIT_TYPE_NOTE";

// ─── DB Row Interfaces ──────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  ownerEmail: string;
  createdAt: string;
}

export interface AiPolicies {
  confirmation?: string;
  cancellation?: string;
  noShow?: string;
  [key: string]: string | undefined;
}

export interface Unit {
  id: string;
  organizationId: string;
  segment: UnitSegment;
  templateKey: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  ownerEmail: string;
  setupCompleted: boolean;
  setupData: Record<string, unknown> | null;
  openingHours: Record<string, unknown> | null;
  bookingRules: Record<string, unknown> | null;
  aiEnabled: boolean;
  aiTone: string | null;
  aiSystemPrompt: string | null;
  aiGreeting: string | null;
  aiFallback: string | null;
  aiPolicies: AiPolicies | null;
  publicSlug: string | null;
  logoPath: string | null;
  brandPrimaryColor: string | null;
  brandHighlightColor: string | null;
  brandSurfaceTintColor: string | null;
  whatsappInstance: string | null;
  whatsappNumber: string | null;
  createdAt: string;
}

export interface Professional {
  id: string;
  name: string;
  specialty: string | null;
  color: string | null;
  phone: string | null;
  email: string | null;
  bio: string | null;
  workStart: string | null;
  workEnd: string | null;
  workingDays: number[] | null;
  isActive: boolean;
  unitId: string;
  commissionPercent: number | null;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMin: number;
  price: number;
  category: string | null;
  isActive: boolean;
  unitId: string;
  cost: number | null;
  suggestedCommissionPercent: number | null;
}

export interface ServiceImage {
  id: string;
  serviceId: string;
  path: string;
  displayOrder: number;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  birthday: string | null;
  tags: string[] | null;
  unitId: string;
  marketingAudienceId: string | null;
  createdAt: string;
}

export interface Appointment {
  id: string;
  unitId: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  entryMode: EntryMode;
  retroReason: string | null;
  notes: string | null;
  totalPrice: number | null;
  createdAt: string;
}

export interface CatalogOption {
  id: string;
  unitId: string;
  domain: CatalogDomain;
  label: string;
  isActive: boolean;
  createdAt: string;
}

export interface MarketingAudience {
  id: string;
  unitId: string;
  name: string;
  description: string | null;
  channelHint: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingCampaign {
  id: string;
  unitId: string;
  name: string;
  objective: string | null;
  channel: string | null;
  message: string;
  status: CampaignStatus;
  audienceId: string | null;
  audienceLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  unitId: string;
  name: string;
  category: string | null;
  objective: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  organizationId: string | null;
  defaultUnitId: string | null;
  authUserId: string | null;
  createdAt: string;
}

export interface UserUnit {
  id: string;
  userId: string;
  unitId: string;
  role: UserRole;
  createdAt: string;
}

// ─── RPC Return Types ───────────────────────────────────────────────────────

export interface UnitByWhatsApp {
  unit_id: string;
  unit_name: string;
  segment: UnitSegment;
  whatsapp_instance: string;
  ai_enabled: boolean;
}

// ─── Conversation History ───────────────────────────────────────────────────

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Agent Tool Input Types ─────────────────────────────────────────────────

export interface ConsultarAgendaInput {
  professional_id?: string;
  date: string;
  service_id?: string;
}

export interface CriarAgendamentoInput {
  professional_id: string;
  service_id: string;
  starts_at: string;
  client_name: string;
}

export interface CancelarAgendamentoInput {
  appointment_id: string;
}

// ─── WAHA Webhook Types ────────────────────────────────────────────────────

export interface WahaWebhookEvent {
  id: string;
  timestamp: number;
  session: string;
  metadata: Record<string, unknown> | null;
  engine: string;
  me: { id: string; pushName: string } | null;
  event: string;
  payload: WahaMessagePayload;
}

export interface WahaMessagePayload {
  id: string;
  timestamp: number;
  from: string;
  fromMe: boolean;
  to: string;
  participant: string | null;
  body: string;
  hasMedia: boolean;
  media: unknown | null;
  mediaUrl: string;
  ack: number;
  ackName: string;
  source: string;
  author: string | null;
  replyTo: unknown | null;
  _data: unknown;
}

// ─── Plan & Usage Types ────────────────────────────────────────────────────

export interface Plan {
  id: string;
  name: string;
  slug: string;
  maxAiMessagesPerMonth: number;
  maxClientsPerUnit: number;
  maxProfessionalsPerUnit: number;
  maxCampaignsPerDay: number;
  maxMessagesPerPhonePerHour: number;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UnitPlan {
  id: string;
  unitId: string;
  planId: string;
  startsAt: string;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface UsageCounter {
  id: string;
  unitId: string;
  metric: UsageMetric;
  period: string;
  count: number;
  limit: number;
  createdAt: string;
  updatedAt: string;
}

export type UsageMetric =
  | "ai_messages_monthly"
  | "campaigns_daily"
  | "messages_per_phone_hourly";

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  metric: string;
  remainingPercent: number;
}

/**
 * Remove all non-digit characters from a phone string.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Format a date as "Segunda-feira, 28 de marco de 2026" in pt-BR.
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * Format a date/time as "14:30" in pt-BR timezone.
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * Format a number as Brazilian currency: "R$ 150,00".
 */
export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Emit a structured JSON log line to stdout.
 */
export function structuredLog(
  level: "info" | "warn" | "error",
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };
  console.log(JSON.stringify(entry));
}

/**
 * Sleep for the given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Helpers for WhatsApp JID handling ──────────────────────────────────────

/**
 * Returns true if the remoteJid belongs to a group chat.
 */
export function isGroupMessage(remoteJid: string): boolean {
  return remoteJid.includes("@g.us");
}

/**
 * Extract the phone number from a WhatsApp JID.
 */
export function extractPhoneFromJid(jid: string): string {
  return normalizePhone(jid.split("@")[0] ?? "");
}


export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export class SupabaseClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: SupabaseConfig) {
    this.baseUrl = `${config.url.replace(/\/$/, "")}/rest/v1`;
    this.headers = {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
  }

  /**
   * Generic query method. Table names are quoted for PascalCase support.
   */
  async query<T>(
    table: string,
    options: {
      select?: string;
      filters?: Record<string, string>;
      order?: string;
      limit?: number;
    } = {},
  ): Promise<T[]> {
    const url = new URL(`${this.baseUrl}/"${table}"`);

    if (options.select) url.searchParams.set("select", options.select);
    if (options.order) url.searchParams.set("order", options.order);
    if (options.limit) url.searchParams.set("limit", String(options.limit));

    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        url.searchParams.set(key, value);
      }
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "supabase_query_error", { table, status: res.status, error: errorBody });
      throw new Error(`Supabase query "${table}" failed: ${res.status} ${errorBody}`);
    }

    return res.json() as Promise<T[]>;
  }

  /**
   * Insert a row into a table. Returns the inserted row.
   */
  async insert<T>(table: string, data: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}/"${table}"`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "supabase_insert_error", { table, status: res.status, error: errorBody });
      throw new Error(`Supabase insert "${table}" failed: ${res.status} ${errorBody}`);
    }

    const rows = (await res.json()) as T[];
    // PostgREST returns an array with Prefer: return=representation
    return (Array.isArray(rows) ? rows[0] : rows) as T;
  }

  /**
   * Update a row by id. Returns the updated row.
   */
  async update<T>(table: string, id: string, data: Record<string, unknown>): Promise<T> {
    const url = new URL(`${this.baseUrl}/"${table}"`);
    url.searchParams.set("id", `eq.${id}`);

    const res = await fetch(url.toString(), {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "supabase_update_error", { table, id, status: res.status, error: errorBody });
      throw new Error(`Supabase update "${table}" id=${id} failed: ${res.status} ${errorBody}`);
    }

    const rows = (await res.json()) as T[];
    return (Array.isArray(rows) ? rows[0] : rows) as T;
  }

  /**
   * Call a Postgres RPC function.
   */
  async rpc<T>(functionName: string, params?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${this.baseUrl}/rpc/${functionName}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(params ?? {}),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "supabase_rpc_error", { fn: functionName, status: res.status, error: errorBody });
      throw new Error(`Supabase RPC "${functionName}" failed: ${res.status} ${errorBody}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * Raw GET request via PostgREST for complex filters.
   * The path is appended to the base REST URL (e.g. `/"Service"?unitId=eq.xxx&isActive=eq.true`).
   */
  async rawGet<T>(path: string): Promise<T[]> {
    const url = `${this.baseUrl}/${path}`;

    const res = await fetch(url, {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "supabase_raw_get_error", { path, status: res.status, error: errorBody });
      throw new Error(`Supabase rawGet "${path}" failed: ${res.status} ${errorBody}`);
    }

    return res.json() as Promise<T[]>;
  }
}


export interface WahaConfig {
  apiUrl: string;
  apiKey: string;
}

/** Session status returned by WAHA */
export type WahaSessionStatus =
  | "STOPPED"
  | "STARTING"
  | "SCAN_QR_CODE"
  | "WORKING"
  | "FAILED";

/** Session info returned by list/get endpoints */
export interface WahaSession {
  name: string;
  status: WahaSessionStatus;
  me: { id: string; pushName: string } | null;
  config: Record<string, unknown>;
  engine: string;
}

/** QR code response */
export interface WahaQrCode {
  value: string;
  mimetype: string;
}

/** Webhook config for session creation */
export interface WahaWebhookConfig {
  url: string;
  events: string[];
  hmac?: { key: string };
  retries?: { delaySeconds: number; attempts: number; policy: string };
  customHeaders?: Array<{ name: string; value: string }>;
}

export class WahaClient {
  private readonly apiUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: WahaConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.headers = {
      "X-Api-Key": config.apiKey,
      "Content-Type": "application/json",
    };
  }

  /** Build chatId from phone number: 5511999999999 → 5511999999999@c.us */
  private toChatId(phone: string): string {
    const normalized = normalizePhone(phone);
    return normalized.includes("@") ? normalized : `${normalized}@c.us`;
  }

  // ─── Session Management ──────────────────────────────────────────────

  /** List all WAHA sessions */
  async listSessions(): Promise<WahaSession[]> {
    const res = await fetch(`${this.apiUrl}/api/sessions`, {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_list_sessions_error", { status: res.status, error: errorBody });
      throw new Error(`WAHA listSessions failed: ${res.status} ${errorBody}`);
    }

    return res.json() as Promise<WahaSession[]>;
  }

  /** Get a single session by name */
  async getSession(sessionName: string): Promise<WahaSession> {
    const res = await fetch(`${this.apiUrl}/api/sessions/${sessionName}`, {
      method: "GET",
      headers: this.headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_get_session_error", { session: sessionName, status: res.status, error: errorBody });
      throw new Error(`WAHA getSession failed: ${res.status} ${errorBody}`);
    }

    return res.json() as Promise<WahaSession>;
  }

  /** Create a new session and start it. Returns session info. */
  async createSession(params: {
    name: string;
    webhooks: WahaWebhookConfig[];
    start?: boolean;
  }): Promise<WahaSession> {
    const body = {
      name: params.name,
      start: params.start ?? true,
      config: {
        webhooks: params.webhooks,
      },
    };

    structuredLog("info", "waha_creating_session", { session: params.name });

    const res = await fetch(`${this.apiUrl}/api/sessions`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_create_session_error", { session: params.name, status: res.status, error: errorBody });
      throw new Error(`WAHA createSession failed: ${res.status} ${errorBody}`);
    }

    structuredLog("info", "waha_session_created", { session: params.name });
    return res.json() as Promise<WahaSession>;
  }

  /** Start an existing (stopped) session */
  async startSession(sessionName: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/api/sessions/${sessionName}/start`, {
      method: "POST",
      headers: this.headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_start_session_error", { session: sessionName, status: res.status, error: errorBody });
      throw new Error(`WAHA startSession failed: ${res.status} ${errorBody}`);
    }

    structuredLog("info", "waha_session_started", { session: sessionName });
  }

  /** Stop a running session */
  async stopSession(sessionName: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/api/sessions/${sessionName}/stop`, {
      method: "POST",
      headers: this.headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_stop_session_error", { session: sessionName, status: res.status, error: errorBody });
      throw new Error(`WAHA stopSession failed: ${res.status} ${errorBody}`);
    }

    structuredLog("info", "waha_session_stopped", { session: sessionName });
  }

  /** Delete a session permanently */
  async deleteSession(sessionName: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/api/sessions/${sessionName}`, {
      method: "DELETE",
      headers: this.headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_delete_session_error", { session: sessionName, status: res.status, error: errorBody });
      throw new Error(`WAHA deleteSession failed: ${res.status} ${errorBody}`);
    }

    structuredLog("info", "waha_session_deleted", { session: sessionName });
  }

  /** Logout from WhatsApp (unpair) but keep the session config */
  async logoutSession(sessionName: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/api/sessions/${sessionName}/logout`, {
      method: "POST",
      headers: this.headers,
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_logout_session_error", { session: sessionName, status: res.status, error: errorBody });
      throw new Error(`WAHA logoutSession failed: ${res.status} ${errorBody}`);
    }

    structuredLog("info", "waha_session_logged_out", { session: sessionName });
  }

  /**
   * Get QR code for pairing.
   * Session must be in SCAN_QR_CODE status.
   * Returns the QR value (text) that can be rendered as QR image on frontend.
   */
  async getQrCode(sessionName: string): Promise<WahaQrCode> {
    const res = await fetch(
      `${this.apiUrl}/api/${sessionName}/auth/qr?format=raw`,
      {
        method: "GET",
        headers: this.headers,
      },
    );

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_get_qr_error", { session: sessionName, status: res.status, error: errorBody });
      throw new Error(`WAHA getQrCode failed: ${res.status} ${errorBody}`);
    }

    return res.json() as Promise<WahaQrCode>;
  }

  /**
   * Get QR code as base64 image (PNG).
   * Can be displayed directly in an <img> tag or sent via WhatsApp/email.
   */
  async getQrCodeImage(sessionName: string): Promise<string> {
    const res = await fetch(
      `${this.apiUrl}/api/${sessionName}/auth/qr?format=image`,
      {
        method: "GET",
        headers: this.headers,
      },
    );

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_get_qr_image_error", { session: sessionName, status: res.status, error: errorBody });
      throw new Error(`WAHA getQrCodeImage failed: ${res.status} ${errorBody}`);
    }

    const buffer = await res.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return `data:image/png;base64,${base64}`;
  }

  // ─── Messaging ───────────────────────────────────────────────────────

  async sendText(session: string, phone: string, text: string): Promise<void> {
    const chatId = this.toChatId(phone);
    const url = `${this.apiUrl}/api/sendText`;
    const body = { session, chatId, text };

    structuredLog("info", "waha_sending_text", { session, chatId });

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_send_text_error", {
        session,
        chatId,
        status: res.status,
        error: errorBody,
      });
      throw new Error(`WAHA sendText failed: ${res.status} ${errorBody}`);
    }

    structuredLog("info", "waha_text_sent", { session, chatId });
  }

  async sendImage(
    session: string,
    phone: string,
    imageUrl: string,
    caption: string,
  ): Promise<void> {
    const chatId = this.toChatId(phone);
    const url = `${this.apiUrl}/api/sendImage`;
    const body = {
      session,
      chatId,
      file: {
        mimetype: "image/jpeg",
        url: imageUrl,
        filename: "image.jpg",
      },
      caption,
    };

    structuredLog("info", "waha_sending_image", { session, chatId, imageUrl });

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "waha_send_image_error", {
        session,
        chatId,
        status: res.status,
        error: errorBody,
      });
      throw new Error(`WAHA sendImage failed: ${res.status} ${errorBody}`);
    }

    structuredLog("info", "waha_image_sent", { session, chatId });
  }

  async sendSeen(session: string, phone: string): Promise<void> {
    const chatId = this.toChatId(phone);
    const url = `${this.apiUrl}/api/sendSeen`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ session, chatId }),
    });

    if (!res.ok) {
      structuredLog("warn", "waha_send_seen_error", { session, chatId });
    }
  }

  async startTyping(session: string, phone: string): Promise<void> {
    const chatId = this.toChatId(phone);
    const url = `${this.apiUrl}/api/startTyping`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ session, chatId }),
    });

    if (!res.ok) {
      structuredLog("warn", "waha_start_typing_error", { session, chatId });
    }
  }

  async stopTyping(session: string, phone: string): Promise<void> {
    const chatId = this.toChatId(phone);
    const url = `${this.apiUrl}/api/stopTyping`;

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ session, chatId }),
    });

    if (!res.ok) {
      structuredLog("warn", "waha_stop_typing_error", { session, chatId });
    }
  }
}


// ─── Config & Types ─────────────────────────────────────────────────────────

export interface AnthropicConfig {
  apiKey: string;
  model?: string; // defaults to claude-sonnet-4-20250514
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

export interface ClaudeContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface ClaudeResponse {
  id: string;
  content: ClaudeContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens";
  usage: { input_tokens: number; output_tokens: number };
}

// ─── Client ─────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const API_URL = "https://api.anthropic.com/v1/messages";

export class AnthropicClient {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
  }

  /**
   * Create a message using the Anthropic Messages API.
   */
  async createMessage(params: {
    system?: string;
    messages: ClaudeMessage[];
    tools?: ClaudeTool[];
    max_tokens?: number;
  }): Promise<ClaudeResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: params.max_tokens ?? 1024,
      messages: params.messages,
    };

    if (params.system) {
      body["system"] = params.system;
    }

    if (params.tools && params.tools.length > 0) {
      body["tools"] = params.tools;
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "anthropic_api_error", {
        status: res.status,
        error: errorBody,
      });
      throw new Error(`Anthropic API failed: ${res.status} ${errorBody}`);
    }

    return res.json() as Promise<ClaudeResponse>;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract concatenated text from all text blocks in a Claude response.
 */
export function extractText(response: ClaudeResponse): string {
  return response.content
    .filter((block): block is ClaudeContentBlock & { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Check if the response contains any tool_use blocks.
 */
export function hasToolUse(response: ClaudeResponse): boolean {
  return response.content.some((block) => block.type === "tool_use");
}

/**
 * Get all tool_use blocks from a response.
 */
export function getToolUseBlocks(response: ClaudeResponse): ClaudeContentBlock[] {
  return response.content.filter((block) => block.type === "tool_use");
}


export interface RedisConfig {
  url: string;
  token: string;
}

export class RedisClient {
  private readonly url: string;
  private readonly headers: Record<string, string>;

  constructor(config: RedisConfig) {
    this.url = config.url.replace(/\/$/, "");
    this.headers = {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    };
  }

  private async command<T>(cmd: unknown[]): Promise<T> {
    const res = await fetch(`${this.url}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(cmd),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "redis_command_error", {
        cmd: String(cmd[0]),
        status: res.status,
        error: errorBody,
      });
      throw new Error(`Redis command failed: ${res.status} ${errorBody}`);
    }

    const data = (await res.json()) as { result: T };
    return data.result;
  }

  async get<T>(key: string): Promise<T | null> {
    const result = await this.command<string | null>(["GET", key]);
    if (result === null) return null;
    return JSON.parse(result) as T;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.command(["SET", key, serialized, "EX", ttlSeconds]);
    } else {
      await this.command(["SET", key, serialized]);
    }
  }

  async del(key: string): Promise<void> {
    await this.command(["DEL", key]);
  }

  /** Increment a key by 1. Returns new value. Creates key with value 1 if not exists. */
  async incr(key: string): Promise<number> {
    return this.command<number>(["INCR", key]);
  }

  /** Set expiration on an existing key (seconds). */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.command(["EXPIRE", key, ttlSeconds]);
  }

  /** Get TTL of a key in seconds. Returns -1 if no expiry, -2 if key doesn't exist. */
  async ttl(key: string): Promise<number> {
    return this.command<number>(["TTL", key]);
  }
}


// ─── Default limits (used when no plan is assigned) ────────────────────────

const DEFAULT_LIMITS: Pick<
  Plan,
  | "maxAiMessagesPerMonth"
  | "maxClientsPerUnit"
  | "maxProfessionalsPerUnit"
  | "maxCampaignsPerDay"
  | "maxMessagesPerPhonePerHour"
> = {
  maxAiMessagesPerMonth: 100,
  maxClientsPerUnit: 50,
  maxProfessionalsPerUnit: 1,
  maxCampaignsPerDay: 1,
  maxMessagesPerPhonePerHour: 20,
};

// ─── Key builders ──────────────────────────────────────────────────────────

function monthlyKey(unitId: string): string {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `quota:ai_msg:${unitId}:${period}`;
}

function dailyCampaignKey(unitId: string): string {
  const now = new Date();
  const period = now.toISOString().split("T")[0]!;
  return `quota:campaign:${unitId}:${period}`;
}

function hourlyPhoneKey(unitId: string, phone: string): string {
  const now = new Date();
  const hour = `${now.toISOString().split("T")[0]}T${String(now.getHours()).padStart(2, "0")}`;
  return `quota:phone:${unitId}:${phone}:${hour}`;
}

// ─── Plan resolution ───────────────────────────────────────────────────────

export async function getUnitPlan(
  supabase: SupabaseClient,
  unitId: string,
): Promise<Plan | null> {
  try {
    // Get active plan assignment for this unit
    const assignments = await supabase.query<{ planId: string }>("UnitPlan", {
      filters: {
        unitId: `eq.${unitId}`,
        isActive: "eq.true",
      },
      order: "createdAt.desc",
      limit: 1,
    });

    if (assignments.length === 0 || !assignments[0]) {
      return null;
    }

    // Get the plan details
    const plans = await supabase.query<Plan>("Plan", {
      filters: {
        id: `eq.${assignments[0].planId}`,
        isActive: "eq.true",
      },
      limit: 1,
    });

    return plans[0] ?? null;
  } catch (err) {
    structuredLog("error", "get_unit_plan_error", {
      unitId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Quota checks ──────────────────────────────────────────────────────────

/**
 * Check if a unit can send an AI message (monthly quota).
 * Increments the counter if allowed.
 */
export async function checkAndIncrementAiQuota(
  redis: RedisClient,
  supabase: SupabaseClient,
  unitId: string,
): Promise<QuotaCheckResult> {
  const plan = await getUnitPlan(supabase, unitId);
  const limit = plan?.maxAiMessagesPerMonth ?? DEFAULT_LIMITS.maxAiMessagesPerMonth;

  const key = monthlyKey(unitId);
  const current = await redis.incr(key);

  // Set TTL on first increment (expire at end of month ≈ 32 days)
  if (current === 1) {
    await redis.expire(key, 32 * 24 * 60 * 60);
  }

  const allowed = current <= limit;

  if (!allowed) {
    structuredLog("warn", "ai_quota_exceeded", { unitId, current, limit });
  }

  return {
    allowed,
    current,
    limit,
    metric: "ai_messages_monthly",
    remainingPercent: Math.max(0, Math.round(((limit - current) / limit) * 100)),
  };
}

/**
 * Check if a phone number is within the hourly message limit (anti-flood).
 * Increments the counter if allowed.
 */
export async function checkPhoneRateLimit(
  redis: RedisClient,
  supabase: SupabaseClient,
  unitId: string,
  phone: string,
): Promise<QuotaCheckResult> {
  const plan = await getUnitPlan(supabase, unitId);
  const limit = plan?.maxMessagesPerPhonePerHour ?? DEFAULT_LIMITS.maxMessagesPerPhonePerHour;

  const key = hourlyPhoneKey(unitId, phone);
  const current = await redis.incr(key);

  // Expire at end of hour (3600 seconds)
  if (current === 1) {
    await redis.expire(key, 3600);
  }

  const allowed = current <= limit;

  if (!allowed) {
    structuredLog("warn", "phone_rate_limit_exceeded", { unitId, phone, current, limit });
  }

  return {
    allowed,
    current,
    limit,
    metric: "messages_per_phone_hourly",
    remainingPercent: Math.max(0, Math.round(((limit - current) / limit) * 100)),
  };
}

/**
 * Check if a unit can send more campaign messages today.
 * Increments the counter if allowed.
 */
export async function checkCampaignQuota(
  redis: RedisClient,
  supabase: SupabaseClient,
  unitId: string,
): Promise<QuotaCheckResult> {
  const plan = await getUnitPlan(supabase, unitId);
  const limit = plan?.maxCampaignsPerDay ?? DEFAULT_LIMITS.maxCampaignsPerDay;

  const key = dailyCampaignKey(unitId);
  const current = await redis.incr(key);

  // Expire at end of day (86400 seconds)
  if (current === 1) {
    await redis.expire(key, 86400);
  }

  const allowed = current <= limit;

  if (!allowed) {
    structuredLog("warn", "campaign_quota_exceeded", { unitId, current, limit });
  }

  return {
    allowed,
    current,
    limit,
    metric: "campaigns_daily",
    remainingPercent: Math.max(0, Math.round(((limit - current) / limit) * 100)),
  };
}

/**
 * Get current usage summary for a unit (without incrementing).
 */
export async function getUsageSummary(
  redis: RedisClient,
  supabase: SupabaseClient,
  unitId: string,
): Promise<{
  plan: Pick<Plan, "name" | "slug"> | null;
  aiMessages: { current: number; limit: number; remainingPercent: number };
  campaignsToday: { current: number; limit: number; remainingPercent: number };
}> {
  const plan = await getUnitPlan(supabase, unitId);

  const aiLimit = plan?.maxAiMessagesPerMonth ?? DEFAULT_LIMITS.maxAiMessagesPerMonth;
  const campaignLimit = plan?.maxCampaignsPerDay ?? DEFAULT_LIMITS.maxCampaignsPerDay;

  // Get current counts without incrementing
  const aiKey = monthlyKey(unitId);
  const campaignKey = dailyCampaignKey(unitId);

  let aiCurrent = 0;
  let campaignCurrent = 0;

  try {
    const aiVal = await redis.get<number>(aiKey);
    if (aiVal !== null) aiCurrent = aiVal;
  } catch {
    // Key doesn't exist
  }

  try {
    const campVal = await redis.get<number>(campaignKey);
    if (campVal !== null) campaignCurrent = campVal;
  } catch {
    // Key doesn't exist
  }

  return {
    plan: plan ? { name: plan.name, slug: plan.slug } : null,
    aiMessages: {
      current: aiCurrent,
      limit: aiLimit,
      remainingPercent: Math.max(0, Math.round(((aiLimit - aiCurrent) / aiLimit) * 100)),
    },
    campaignsToday: {
      current: campaignCurrent,
      limit: campaignLimit,
      remainingPercent: Math.max(0, Math.round(((campaignLimit - campaignCurrent) / campaignLimit) * 100)),
    },
  };
}


// === WEBHOOK ===

const HISTORY_TTL = 86400; // 24h
const MAX_MESSAGES = 20;
const MAX_AGENT_ROUNDS = 5;
const AGENT_TOOLS: ClaudeTool[] = [
  {
    name: "consultar_agenda",
    description:
      "Consulta horarios disponiveis de um ou todos os profissionais em uma data especifica. " +
      "Retorna os slots livres considerando a jornada de trabalho e agendamentos existentes.",
    input_schema: {
      type: "object",
      properties: {
        professional_id: {
          type: "string",
          description: "ID do profissional (opcional — se omitido, consulta todos)",
        },
        date: {
          type: "string",
          description: "Data no formato YYYY-MM-DD",
        },
        service_id: {
          type: "string",
          description: "ID do servico (opcional — usado para calcular duracao do slot)",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "criar_agendamento",
    description:
      "Cria um novo agendamento apos o cliente confirmar profissional, servico, data e horario. " +
      "Retorna os dados do agendamento criado.",
    input_schema: {
      type: "object",
      required: ["professional_id", "service_id", "starts_at", "client_name"],
      properties: {
        professional_id: {
          type: "string",
          description: "ID do profissional",
        },
        service_id: {
          type: "string",
          description: "ID do servico",
        },
        starts_at: {
          type: "string",
          description: "Data/hora de inicio no formato ISO 8601 (ex: 2026-03-29T10:00:00-03:00)",
        },
        client_name: {
          type: "string",
          description: "Nome do cliente",
        },
      },
    },
  },
  {
    name: "cancelar_agendamento",
    description:
      "Cancela um agendamento existente. Altera o status para CANCELLED.",
    input_schema: {
      type: "object",
      required: ["appointment_id"],
      properties: {
        appointment_id: {
          type: "string",
          description: "ID do agendamento a ser cancelado",
        },
      },
    },
  },
  {
    name: "listar_servicos",
    description:
      "Lista todos os servicos ativos disponiveis na unidade, com nome, duracao e preco.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];
async function verifyHmac(
  secret: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  try {
    const prefix = "sha256=";
    const receivedHex = signatureHeader.startsWith(prefix)
      ? signatureHeader.slice(prefix.length)
      : signatureHeader;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const computedHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (computedHex.length !== receivedHex.length) return false;
    let mismatch = 0;
    for (let i = 0; i < computedHex.length; i++) {
      mismatch |= computedHex.charCodeAt(i) ^ receivedHex.charCodeAt(i);
    }
    return mismatch === 0;
  } catch (err) {
    structuredLog("error", "hmac_verification_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function historyKey(unitId: string, phone: string): string {
  return `conv:${unitId}:${normalizePhone(phone)}`;
}
async function loadHistory(
  redis: RedisClient,
  unitId: string,
  phone: string,
): Promise<ConversationMessage[]> {
  try {
    const key = historyKey(unitId, phone);
    return (await redis.get<ConversationMessage[]>(key)) ?? [];
  } catch (err) {
    structuredLog("warn", "load_history_error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
async function saveHistory(
  redis: RedisClient,
  unitId: string,
  phone: string,
  messages: ConversationMessage[],
): Promise<void> {
  try {
    const key = historyKey(unitId, phone);
    const trimmed = messages.slice(-MAX_MESSAGES);
    await redis.set(key, trimmed, HISTORY_TTL);
  } catch (err) {
    structuredLog("warn", "save_history_error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
async function consultarAgenda(
  supabase: SupabaseClient,
  unitId: string,
  input: ConsultarAgendaInput,
): Promise<string> {
  const { date, professional_id, service_id } = input;
  let professionals: Professional[];
  if (professional_id) {
    professionals = await supabase.query<Professional>("Professional", {
      filters: {
        id: `eq.${professional_id}`,
        unitId: `eq.${unitId}`,
        isActive: "eq.true",
      },
    });
  } else {
    professionals = await supabase.query<Professional>("Professional", {
      filters: {
        unitId: `eq.${unitId}`,
        isActive: "eq.true",
      },
    });
  }
  if (professionals.length === 0) {
    return "Nenhum profissional ativo encontrado.";
  }
  let slotDuration = 30;
  if (service_id) {
    try {
      const services = await supabase.query<Service>("Service", {
        filters: { id: `eq.${service_id}`, unitId: `eq.${unitId}` },
        limit: 1,
      });
      if (services.length > 0 && services[0]) {
        slotDuration = services[0].durationMin;
      }
    } catch {
    }
  }
  const targetDate = new Date(`${date}T12:00:00-03:00`);
  const dayOfWeek = targetDate.getDay();
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;
  const results: string[] = [];
  for (const prof of professionals) {
    if (prof.workingDays && !prof.workingDays.includes(dayOfWeek)) {
      results.push(`${prof.name}: Nao trabalha neste dia.`);
      continue;
    }
    const workStart = prof.workStart ?? "09:00";
    const workEnd = prof.workEnd ?? "18:00";
    const appointments = await supabase.query<Appointment>("Appointment", {
      filters: {
        professionalId: `eq.${prof.id}`,
        startsAt: `gte.${dayStart}`,
        endsAt: `lte.${dayEnd}`,
        status: "in.(CONFIRMED,PENDING)",
      },
      order: "startsAt.asc",
    });
    const slots = calculateAvailableSlots(
      date,
      workStart,
      workEnd,
      slotDuration,
      appointments,
    );
    if (slots.length === 0) {
      results.push(`${prof.name} (${prof.specialty ?? "Geral"}): Sem horarios disponiveis.`);
    } else {
      const slotList = slots.join(", ");
      results.push(
        `${prof.name} (${prof.specialty ?? "Geral"}) — ID: ${prof.id}\n  Horarios: ${slotList}`,
      );
    }
  }
  const formattedDate = formatDate(targetDate);
  return `Disponibilidade para ${formattedDate}:\n\n${results.join("\n\n")}`;
}
function calculateAvailableSlots(
  date: string,
  workStart: string,
  workEnd: string,
  durationMin: number,
  appointments: Appointment[],
): string[] {
  const slots: string[] = [];
  const [startHour, startMin] = workStart.split(":").map(Number);
  const [endHour, endMin] = workEnd.split(":").map(Number);
  const workStartMinutes = (startHour ?? 9) * 60 + (startMin ?? 0);
  const workEndMinutes = (endHour ?? 18) * 60 + (endMin ?? 0);
  const occupied: Array<{ start: number; end: number }> = [];
  for (const appt of appointments) {
    const apptStart = new Date(appt.startsAt);
    const apptEnd = new Date(appt.endsAt);
    occupied.push({
      start: apptStart.getHours() * 60 + apptStart.getMinutes(),
      end: apptEnd.getHours() * 60 + apptEnd.getMinutes(),
    });
  }
  let cursor = workStartMinutes;
  while (cursor + durationMin <= workEndMinutes) {
    const slotEnd = cursor + durationMin;
    const isOccupied = occupied.some(
      (occ) => cursor < occ.end && slotEnd > occ.start,
    );
    if (!isOccupied) {
      const h = String(Math.floor(cursor / 60)).padStart(2, "0");
      const m = String(cursor % 60).padStart(2, "0");
      slots.push(`${h}:${m}`);
    }
    cursor += durationMin;
  }
  return slots;
}
async function criarAgendamento(
  supabase: SupabaseClient,
  unitId: string,
  senderPhone: string,
  input: CriarAgendamentoInput,
): Promise<string> {
  const { professional_id, service_id, starts_at, client_name } = input;
  const services = await supabase.query<Service>("Service", {
    filters: { id: `eq.${service_id}`, unitId: `eq.${unitId}` },
    limit: 1,
  });
  if (services.length === 0 || !services[0]) {
    return "Servico nao encontrado. Por favor, verifique o ID do servico.";
  }
  const service = services[0];
  const professionals = await supabase.query<Professional>("Professional", {
    filters: {
      id: `eq.${professional_id}`,
      unitId: `eq.${unitId}`,
      isActive: "eq.true",
    },
    limit: 1,
  });
  if (professionals.length === 0 || !professionals[0]) {
    return "Profissional nao encontrado ou inativo.";
  }
  const professional = professionals[0];
  const normalizedPhone = normalizePhone(senderPhone);
  let clientId: string;
  const existingClients = await supabase.query<Client>("Client", {
    select: "id,name",
    filters: {
      phone: `eq.${normalizedPhone}`,
      unitId: `eq.${unitId}`,
    },
    limit: 1,
  });
  if (existingClients.length > 0 && existingClients[0]) {
    clientId = existingClients[0].id;
  } else {
    const newClient = await supabase.insert<Client>("Client", {
      name: client_name,
      phone: normalizedPhone,
      unitId: unitId,
    });
    clientId = newClient.id;
  }
  const startsAtDate = new Date(starts_at);
  const endsAtDate = new Date(startsAtDate.getTime() + service.durationMin * 60 * 1000);
  const appointment = await supabase.insert<Appointment>("Appointment", {
    unitId: unitId,
    clientId: clientId,
    professionalId: professional_id,
    serviceId: service_id,
    startsAt: startsAtDate.toISOString(),
    endsAt: endsAtDate.toISOString(),
    status: "CONFIRMED",
    entryMode: "SCHEDULED",
    totalPrice: service.price,
  });
  const dateStr = formatDate(startsAtDate);
  const timeStr = formatTime(startsAtDate);
  const priceStr = formatCurrency(service.price);
  return (
    `Agendamento confirmado!\n\n` +
    `Servico: ${service.name}\n` +
    `Profissional: ${professional.name}\n` +
    `Data: ${dateStr}\n` +
    `Horario: ${timeStr}\n` +
    `Valor: ${priceStr}\n` +
    `ID do agendamento: ${appointment.id}`
  );
}
async function cancelarAgendamento(
  supabase: SupabaseClient,
  unitId: string,
  input: CancelarAgendamentoInput,
): Promise<string> {
  const { appointment_id } = input;
  const appointments = await supabase.query<Appointment>("Appointment", {
    filters: {
      id: `eq.${appointment_id}`,
      unitId: `eq.${unitId}`,
    },
    limit: 1,
  });
  if (appointments.length === 0 || !appointments[0]) {
    return "Agendamento nao encontrado.";
  }
  const appt = appointments[0];
  if (appt.status === "CANCELLED") {
    return "Este agendamento ja esta cancelado.";
  }
  await supabase.update<Appointment>("Appointment", appointment_id, {
    status: "CANCELLED",
  });
  return `Agendamento ${appointment_id} cancelado com sucesso.`;
}
async function listarServicos(
  supabase: SupabaseClient,
  unitId: string,
): Promise<string> {
  const services = await supabase.query<Service>("Service", {
    filters: {
      unitId: `eq.${unitId}`,
      isActive: "eq.true",
    },
    order: "name.asc",
  });
  if (services.length === 0) {
    return "Nenhum servico ativo cadastrado nesta unidade.";
  }
  const lines = services.map((s) => {
    const price = formatCurrency(s.price);
    const duration = `${s.durationMin} min`;
    const desc = s.description ? ` — ${s.description}` : "";
    return `- ${s.name} (${duration}, ${price})${desc}\n  ID: ${s.id}`;
  });
  return `Servicos disponiveis:\n\n${lines.join("\n\n")}`;
}
async function executeTool(
  supabase: SupabaseClient,
  unitId: string,
  senderPhone: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case "consultar_agenda":
      return await consultarAgenda(
        supabase,
        unitId,
        toolInput as unknown as ConsultarAgendaInput,
      );
    case "criar_agendamento":
      return await criarAgendamento(
        supabase,
        unitId,
        senderPhone,
        toolInput as unknown as CriarAgendamentoInput,
      );
    case "cancelar_agendamento":
      return await cancelarAgendamento(
        supabase,
        unitId,
        toolInput as unknown as CancelarAgendamentoInput,
      );
    case "listar_servicos":
      return await listarServicos(supabase, unitId);
    default:
      return `Ferramenta desconhecida: ${toolName}`;
  }
}
async function runAgentConversation(params: {
  supabase: SupabaseClient;
  anthropic: AnthropicClient;
  redis: RedisClient;
  unitId: string;
  senderPhone: string;
  clientName: string;
  messageText: string;
  systemPrompt: string;
}): Promise<string> {
  const {
    supabase,
    anthropic,
    redis,
    unitId,
    senderPhone,
    clientName,
    messageText,
    systemPrompt,
  } = params;
  const history = await loadHistory(redis, unitId, senderPhone);
  const claudeMessages: ClaudeMessage[] = history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
  claudeMessages.push({
    role: "user",
    content: messageText,
  });
  let responseText = "";
  let rounds = 0;
  while (rounds < MAX_AGENT_ROUNDS) {
    rounds++;
    const claudeResponse: ClaudeResponse = await anthropic.createMessage({
      system: systemPrompt,
      messages: claudeMessages,
      tools: AGENT_TOOLS,
      max_tokens: 1024,
    });
    const toolUseBlocks = claudeResponse.content.filter(
      (block): block is ClaudeContentBlock & { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        block.type === "tool_use",
    );
    if (toolUseBlocks.length === 0 || claudeResponse.stop_reason === "end_turn") {
      const textBlocks = claudeResponse.content.filter(
        (block): block is ClaudeContentBlock & { type: "text"; text: string } =>
          block.type === "text" && typeof block.text === "string",
      );
      responseText = textBlocks.map((b) => b.text).join("");
      break;
    }
    claudeMessages.push({
      role: "assistant",
      content: claudeResponse.content,
    });
    const toolResults: ClaudeContentBlock[] = [];
    for (const toolBlock of toolUseBlocks) {
      structuredLog("info", "tool_call", {
        tool: toolBlock.name,
        unitId,
        phone: senderPhone,
      });
      let toolResult: string;
      try {
        toolResult = await executeTool(
          supabase,
          unitId,
          senderPhone,
          toolBlock.name,
          toolBlock.input,
        );
      } catch (err) {
        structuredLog("error", "tool_execution_error", {
          tool: toolBlock.name,
          error: err instanceof Error ? err.message : String(err),
        });
        toolResult = `Erro ao executar ${toolBlock.name}: ${err instanceof Error ? err.message : String(err)}`;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolBlock.id,
        content: toolResult,
      });
    }
    claudeMessages.push({
      role: "user",
      content: toolResults,
    });
  }
  if (!responseText) {
    responseText =
      "Desculpe, nao consegui processar completamente sua solicitacao. " +
      "Pode tentar novamente ou reformular sua mensagem?";
  }
  history.push({ role: "user", content: messageText });
  history.push({ role: "assistant", content: responseText });
  await saveHistory(redis, unitId, senderPhone, history);
  return responseText;
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") ?? "";
  if (signature && webhookSecret) {
    const valid = await verifyHmac(webhookSecret, rawBody, signature);
    if (!valid) {
      structuredLog("warn", "hmac_invalid", {});
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
  }
  let event: WahaWebhookEvent;
  try {
    event = JSON.parse(rawBody) as WahaWebhookEvent;
  } catch {
    return jsonResponse({ ignored: true, reason: "invalid_json" });
  }
  if (event.event !== "message") {
    return jsonResponse({ ignored: true, reason: "not_message_event" });
  }
  const { payload } = event;
  if (payload.fromMe) {
    return jsonResponse({ ignored: true, reason: "from_me" });
  }
  if (payload.from.endsWith("@g.us")) {
    return jsonResponse({ ignored: true, reason: "group_message" });
  }
  if (!payload.body || payload.body.trim() === "") {
    return jsonResponse({ ignored: true, reason: "empty_message" });
  }
  const senderPhone = extractPhoneFromJid(payload.from);
  const session = event.session; // WAHA session = whatsappInstance
  const supabase = new SupabaseClient({
    url: Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  });
  const waha = new WahaClient({
    apiUrl: Deno.env.get("WAHA_API_URL") ?? "",
    apiKey: Deno.env.get("WAHA_API_KEY") ?? "",
  });
  const anthropic = new AnthropicClient({
    apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
  });
  const redis = new RedisClient({
    url: Deno.env.get("UPSTASH_REDIS_URL") ?? "",
    token: Deno.env.get("UPSTASH_REDIS_TOKEN") ?? "",
  });
  try {
    const units = await supabase.query<Unit>("Unit", {
      filters: { whatsappInstance: `eq.${session}` },
      limit: 1,
    });
    if (units.length === 0 || !units[0]) {
      structuredLog("info", "unit_not_found", { session });
      return jsonResponse({ ignored: true, reason: "unit_not_found" });
    }
    const unit = units[0];
    if (!unit.aiEnabled) {
      return jsonResponse({ ignored: true, reason: "ai_disabled" });
    }
    try {
      await checkPhoneRateLimit(redis, supabase, unit.id, senderPhone);
      await checkAndIncrementAiQuota(redis, supabase, unit.id);
    } catch {
    }
    const systemPrompt = await supabase.rpc<string>("build_agent_prompt", {
      p_unit_id: unit.id,
    });
    let clientName = "Cliente";
    try {
      const clients = await supabase.query<Client>("Client", {
        select: "id,name",
        filters: {
          phone: `eq.${senderPhone}`,
          unitId: `eq.${unit.id}`,
        },
        limit: 1,
      });
      if (clients.length > 0 && clients[0]) {
        clientName = clients[0].name;
      }
    } catch {
    }
    await waha.startTyping(session, senderPhone).catch(() => {});
    const responseText = await runAgentConversation({
      supabase,
      anthropic,
      redis,
      unitId: unit.id,
      senderPhone,
      clientName,
      messageText: payload.body,
      systemPrompt,
    });
    await waha.stopTyping(session, senderPhone).catch(() => {});
    await waha.sendText(session, senderPhone, responseText);
    await waha.sendSeen(session, senderPhone).catch(() => {});
    structuredLog("info", "message_processed", {
      unitId: unit.id,
      phone: senderPhone,
    });
    return jsonResponse({ success: true, unitId: unit.id });
  } catch (error) {
    structuredLog("error", "webhook_error", {
      error: error instanceof Error ? error.message : String(error),
      session,
      phone: senderPhone,
    });
    return jsonResponse({ success: false, error: "processing_error" });
  }
});