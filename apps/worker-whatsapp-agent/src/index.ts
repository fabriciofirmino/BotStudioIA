import {
  SupabaseClient,
  structuredLog,
  extractMessageText,
  isGroupMessage,
  extractPhoneFromJid,
  normalizePhone,
} from "studioflow-sdk";
import type {
  EvolutionWebhookPayload,
  UnitByWhatsApp,
  Client,
} from "studioflow-sdk";
import { handleAgentConversation } from "./agent.js";

export interface Env {
  CONV_HISTORY: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ANTHROPIC_API_KEY: string;
  EVOLUTION_API_URL: string;
  EVOLUTION_API_KEY: string;
  WEBHOOK_SECRET: string;
}

async function verifyHmac(
  secret: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const digest = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const expected = signature.replace("sha256=", "");
  return digest === expected;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/webhook") {
      return new Response("Not found", { status: 404 });
    }

    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return new Response("OK", { status: 200 });
    }

    // HMAC validation
    const signature = request.headers.get("x-hub-signature-256");
    if (!signature) {
      structuredLog("warn", "missing_hmac_signature");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (env.WEBHOOK_SECRET) {
      const valid = await verifyHmac(env.WEBHOOK_SECRET, rawBody, signature);
      if (!valid) {
        structuredLog("warn", "invalid_hmac_signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    let payload: EvolutionWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as EvolutionWebhookPayload;
    } catch {
      structuredLog("warn", "invalid_json_payload");
      return jsonResponse({ ignored: true, reason: "invalid_json" });
    }

    // Only process message events
    if (
      payload.event !== "messages.upsert" ||
      !payload.data?.key?.remoteJid
    ) {
      return jsonResponse({ ignored: true, reason: "not_message_event" });
    }

    const { key, pushName } = payload.data;

    // Ignore group messages and own messages
    if (isGroupMessage(key.remoteJid)) {
      return jsonResponse({ ignored: true, reason: "group_message" });
    }
    if (key.fromMe) {
      return jsonResponse({ ignored: true, reason: "from_me" });
    }

    const messageText = extractMessageText(payload.data);
    if (!messageText) {
      return jsonResponse({ ignored: true, reason: "no_text" });
    }

    const senderPhone = extractPhoneFromJid(key.remoteJid);
    const destination = normalizePhone(payload.instance);

    // Initialize Supabase client
    const supabase = new SupabaseClient({
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    });

    try {
      // Resolve unit by WhatsApp number
      const unitResults = await supabase.rpc<UnitByWhatsApp[]>(
        "get_unit_by_whatsapp",
        { p_number: destination },
      );

      if (!unitResults || unitResults.length === 0) {
        structuredLog("info", "unit_not_found", { destination });
        return jsonResponse({ ignored: true, reason: "unit_not_found" });
      }

      const unit = unitResults[0]!;

      if (!unit.ai_enabled) {
        structuredLog("info", "ai_disabled", { unitId: unit.unit_id });
        return jsonResponse({ ignored: true, reason: "ai_disabled" });
      }

      // Look up client by phone
      const clientName = pushName ?? "Cliente";

      await handleAgentConversation({
        unitId: unit.unit_id,
        unitName: unit.unit_name,
        whatsappInstance: unit.whatsapp_instance,
        senderPhone,
        pushName: clientName,
        messageText,
        env,
        convHistory: env.CONV_HISTORY,
      });

      structuredLog("info", "message_processed", {
        unitId: unit.unit_id,
        phone: senderPhone,
      });

      return jsonResponse({ success: true, unitId: unit.unit_id });
    } catch (error) {
      structuredLog("error", "webhook_processing_error", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Always return 200 to Evolution API
    return jsonResponse({ success: false, error: "processing_error" });
  },
};

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
