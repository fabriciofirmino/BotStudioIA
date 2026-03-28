import type { ConversationMessage } from "studioflow-sdk";
import { normalizePhone, structuredLog } from "studioflow-sdk";

const MAX_MESSAGES = 20;
const TTL_SECONDS = 86400; // 24 hours

function buildKey(unitId: string, phone: string): string {
  const normalized = normalizePhone(phone);
  return `conv:${unitId}:${normalized}`;
}

export async function loadHistory(
  kv: KVNamespace,
  unitId: string,
  phone: string,
): Promise<ConversationMessage[]> {
  try {
    const key = buildKey(unitId, phone);
    const data = await kv.get(key, "json");
    if (data && Array.isArray(data)) {
      return data as ConversationMessage[];
    }
    return [];
  } catch (error) {
    structuredLog("error", "load_history_error", {
      unitId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function saveHistory(
  kv: KVNamespace,
  unitId: string,
  phone: string,
  messages: ConversationMessage[],
): Promise<void> {
  try {
    const key = buildKey(unitId, phone);
    const trimmed = messages.slice(-MAX_MESSAGES);
    await kv.put(key, JSON.stringify(trimmed), {
      expirationTtl: TTL_SECONDS,
    });
  } catch (error) {
    structuredLog("error", "save_history_error", {
      unitId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
