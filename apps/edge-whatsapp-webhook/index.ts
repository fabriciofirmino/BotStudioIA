import {
  SupabaseClient,
  WahaClient,
  AnthropicClient,
  RedisClient,
  structuredLog,
  normalizePhone,
  extractPhoneFromJid,
  formatDate,
  formatTime,
  formatCurrency,
  checkAndIncrementAiQuota,
  checkPhoneRateLimit,
} from "../../packages/studioflow-sdk/src/index.ts";
import type {
  WahaWebhookEvent,
  Unit,
  Client,
  ConversationMessage,
  ClaudeMessage,
  ClaudeContentBlock,
  ClaudeTool,
  ClaudeResponse,
  Appointment,
  Professional,
  Service,
  ConsultarAgendaInput,
  CriarAgendamentoInput,
  CancelarAgendamentoInput,
} from "../../packages/studioflow-sdk/src/index.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

const HISTORY_TTL = 86400; // 24h
const MAX_MESSAGES = 20;
const MAX_AGENT_ROUNDS = 5;

// ─── Tool Definitions ───────────────────────────────────────────────────────

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

// ─── HMAC Verification ──────────────────────────────────────────────────────

async function verifyHmac(
  secret: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  try {
    // Header format: "sha256=<hex>"
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

    // Constant-time comparison
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

// ─── JSON Response Helper ───────────────────────────────────────────────────

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Conversation History ───────────────────────────────────────────────────

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

// ─── Tool Execution ─────────────────────────────────────────────────────────

async function consultarAgenda(
  supabase: SupabaseClient,
  unitId: string,
  input: ConsultarAgendaInput,
): Promise<string> {
  const { date, professional_id, service_id } = input;

  // Fetch professionals for this unit
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

  // Determine service duration for slot calculation (default 30 min)
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
      // Use default duration
    }
  }

  // Get day of week (0 = Sunday, 6 = Saturday)
  const targetDate = new Date(`${date}T12:00:00-03:00`);
  const dayOfWeek = targetDate.getDay();

  // Fetch existing appointments for the date
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const results: string[] = [];

  for (const prof of professionals) {
    // Check if professional works on this day
    if (prof.workingDays && !prof.workingDays.includes(dayOfWeek)) {
      results.push(`${prof.name}: Nao trabalha neste dia.`);
      continue;
    }

    const workStart = prof.workStart ?? "09:00";
    const workEnd = prof.workEnd ?? "18:00";

    // Fetch appointments for this professional on this date
    const appointments = await supabase.query<Appointment>("Appointment", {
      filters: {
        professionalId: `eq.${prof.id}`,
        startsAt: `gte.${dayStart}`,
        endsAt: `lte.${dayEnd}`,
        status: "in.(CONFIRMED,PENDING)",
      },
      order: "startsAt.asc",
    });

    // Calculate available slots
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

  // Parse work hours
  const [startHour, startMin] = workStart.split(":").map(Number);
  const [endHour, endMin] = workEnd.split(":").map(Number);

  const workStartMinutes = (startHour ?? 9) * 60 + (startMin ?? 0);
  const workEndMinutes = (endHour ?? 18) * 60 + (endMin ?? 0);

  // Build list of occupied intervals in minutes from midnight
  const occupied: Array<{ start: number; end: number }> = [];
  for (const appt of appointments) {
    const apptStart = new Date(appt.startsAt);
    const apptEnd = new Date(appt.endsAt);
    occupied.push({
      start: apptStart.getHours() * 60 + apptStart.getMinutes(),
      end: apptEnd.getHours() * 60 + apptEnd.getMinutes(),
    });
  }

  // Generate slots
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

  // Look up the service to get duration
  const services = await supabase.query<Service>("Service", {
    filters: { id: `eq.${service_id}`, unitId: `eq.${unitId}` },
    limit: 1,
  });

  if (services.length === 0 || !services[0]) {
    return "Servico nao encontrado. Por favor, verifique o ID do servico.";
  }

  const service = services[0];

  // Verify professional exists and is active
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

  // Look up or create client
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

  // Calculate end time
  const startsAtDate = new Date(starts_at);
  const endsAtDate = new Date(startsAtDate.getTime() + service.durationMin * 60 * 1000);

  // Insert appointment
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

  // Verify appointment exists and belongs to this unit
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

// ─── Agent Conversation Loop ────────────────────────────────────────────────

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

  // Load conversation history
  const history = await loadHistory(redis, unitId, senderPhone);

  // Build Claude messages from history
  const claudeMessages: ClaudeMessage[] = history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Add the new user message
  claudeMessages.push({
    role: "user",
    content: messageText,
  });

  // Agent loop with tool use
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

    // Check for tool_use blocks
    const toolUseBlocks = claudeResponse.content.filter(
      (block): block is ClaudeContentBlock & { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
        block.type === "tool_use",
    );

    if (toolUseBlocks.length === 0 || claudeResponse.stop_reason === "end_turn") {
      // Extract final text response
      const textBlocks = claudeResponse.content.filter(
        (block): block is ClaudeContentBlock & { type: "text"; text: string } =>
          block.type === "text" && typeof block.text === "string",
      );
      responseText = textBlocks.map((b) => b.text).join("");
      break;
    }

    // Add assistant message with all content blocks (text + tool_use)
    claudeMessages.push({
      role: "assistant",
      content: claudeResponse.content,
    });

    // Execute each tool and build tool_result blocks
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

    // Add tool results as a user message
    claudeMessages.push({
      role: "user",
      content: toolResults,
    });
  }

  // Fallback if we hit max rounds without a final text
  if (!responseText) {
    responseText =
      "Desculpe, nao consegui processar completamente sua solicitacao. " +
      "Pode tentar novamente ou reformular sua mensagem?";
  }

  // Update history and save
  history.push({ role: "user", content: messageText });
  history.push({ role: "assistant", content: responseText });
  await saveHistory(redis, unitId, senderPhone, history);

  return responseText;
}

// ─── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();

  // HMAC validation
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

  // Only process "message" events (not "message.any" which includes fromMe)
  if (event.event !== "message") {
    return jsonResponse({ ignored: true, reason: "not_message_event" });
  }

  const { payload } = event;

  // Ignore messages sent by the bot itself
  if (payload.fromMe) {
    return jsonResponse({ ignored: true, reason: "from_me" });
  }

  // Ignore group messages
  if (payload.from.endsWith("@g.us")) {
    return jsonResponse({ ignored: true, reason: "group_message" });
  }

  // Ignore empty messages
  if (!payload.body || payload.body.trim() === "") {
    return jsonResponse({ ignored: true, reason: "empty_message" });
  }

  const senderPhone = extractPhoneFromJid(payload.from);
  const session = event.session; // WAHA session = whatsappInstance

  // Init clients
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
    // Resolve unit by WAHA session name
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

    // ── Rate limit: phone flood protection ──
    const phoneCheck = await checkPhoneRateLimit(redis, supabase, unit.id, senderPhone);
    if (!phoneCheck.allowed) {
      structuredLog("warn", "phone_rate_limited", {
        unitId: unit.id,
        phone: senderPhone,
        current: phoneCheck.current,
        limit: phoneCheck.limit,
      });
      return jsonResponse({ ignored: true, reason: "rate_limited" });
    }

    // ── Quota: monthly AI messages ──
    const aiQuota = await checkAndIncrementAiQuota(redis, supabase, unit.id);
    if (!aiQuota.allowed) {
      structuredLog("warn", "ai_quota_exceeded", {
        unitId: unit.id,
        current: aiQuota.current,
        limit: aiQuota.limit,
      });
      // Send a friendly message to the client
      await waha.sendText(
        session,
        senderPhone,
        "Desculpe, nosso atendimento automático atingiu o limite mensal. " +
        "Por favor, entre em contato diretamente pelo telefone do estabelecimento."
      );
      return jsonResponse({ ignored: true, reason: "quota_exceeded" });
    }

    // Build system prompt via RPC
    const systemPrompt = await supabase.rpc<string>("build_agent_prompt", {
      p_unit_id: unit.id,
    });

    // Lookup client name
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
      // Use fallback name
    }

    // Show typing indicator
    await waha.startTyping(session, senderPhone).catch(() => {});

    // Run agent conversation loop
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

    // Stop typing and send response
    await waha.stopTyping(session, senderPhone).catch(() => {});
    await waha.sendText(session, senderPhone, responseText);

    // Mark as seen
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
    // Always return 200 to WAHA to prevent retries
    return jsonResponse({ success: false, error: "processing_error" });
  }
});
