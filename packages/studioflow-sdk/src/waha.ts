import { normalizePhone, structuredLog } from "./utils.js";

export interface WahaConfig {
  apiUrl: string;
  apiKey: string;
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
