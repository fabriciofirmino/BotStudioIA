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

// ─── Helpers for Evolution webhook payloads ─────────────────────────────────

/**
 * Extract message text from an Evolution webhook data payload.
 */
export function extractMessageText(data: {
  message?: {
    conversation?: string;
    extendedTextMessage?: { text: string };
  };
}): string | null {
  return (
    data.message?.conversation ??
    data.message?.extendedTextMessage?.text ??
    null
  );
}

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
