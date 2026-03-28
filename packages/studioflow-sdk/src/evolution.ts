import { normalizePhone, structuredLog } from "./utils.js";

export interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
}

export class EvolutionClient {
  private readonly apiUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: EvolutionConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.headers = {
      apikey: config.apiKey,
      "Content-Type": "application/json",
    };
  }

  /**
   * Send a plain text message via Evolution API.
   * Phone is normalized (non-digits removed) before sending.
   */
  async sendText(instance: string, phone: string, text: string): Promise<void> {
    const normalized = normalizePhone(phone);
    const url = `${this.apiUrl}/message/sendText/${instance}`;
    const body = { number: normalized, text };

    structuredLog("info", "evolution_sending_text", { instance, phone: normalized });

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "evolution_send_text_error", {
        instance,
        phone: normalized,
        status: res.status,
        error: errorBody,
      });
      throw new Error(`Evolution sendText failed: ${res.status} ${errorBody}`);
    }

    structuredLog("info", "evolution_text_sent", { instance, phone: normalized });
  }

  /**
   * Send a media message (image, video, or document) via Evolution API.
   * Phone is normalized (non-digits removed) before sending.
   */
  async sendMedia(
    instance: string,
    phone: string,
    mediaUrl: string,
    caption: string,
  ): Promise<void> {
    const normalized = normalizePhone(phone);
    const url = `${this.apiUrl}/message/sendMedia/${instance}`;
    const body = {
      number: normalized,
      mediatype: "image",
      media: mediaUrl,
      caption,
    };

    structuredLog("info", "evolution_sending_media", { instance, phone: normalized, mediaUrl });

    const res = await fetch(url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      structuredLog("error", "evolution_send_media_error", {
        instance,
        phone: normalized,
        status: res.status,
        error: errorBody,
      });
      throw new Error(`Evolution sendMedia failed: ${res.status} ${errorBody}`);
    }

    structuredLog("info", "evolution_media_sent", { instance, phone: normalized });
  }
}
