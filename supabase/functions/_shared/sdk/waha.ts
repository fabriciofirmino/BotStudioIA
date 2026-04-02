import { normalizePhone, structuredLog } from "./utils.ts";

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
