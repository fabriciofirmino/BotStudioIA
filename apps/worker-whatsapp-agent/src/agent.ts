import {
  SupabaseClient,
  AnthropicClient,
  EvolutionClient,
  structuredLog,
  extractText,
  hasToolUse,
  getToolUseBlocks,
  normalizePhone,
} from "studioflow-sdk";
import type {
  ClaudeMessage,
  ClaudeContentBlock,
  ClaudeTool,
  Client,
} from "studioflow-sdk";
import type { Env } from "./index.js";
import { loadHistory, saveHistory } from "./history.js";
import { consultarAgenda } from "./tools/agenda.js";
import { criarAgendamento, cancelarAgendamento } from "./tools/appointment.js";
import { listarServicos } from "./tools/services.js";

const AGENT_TOOLS: ClaudeTool[] = [
  {
    name: "consultar_agenda",
    description:
      "Consulta horarios disponiveis. Use quando cliente perguntar sobre disponibilidade ou quiser agendar.",
    input_schema: {
      type: "object",
      properties: {
        professional_id: {
          type: "string",
          description: "ID do profissional (opcional)",
        },
        date: {
          type: "string",
          description: "Data no formato YYYY-MM-DD",
        },
        service_id: {
          type: "string",
          description: "ID do servico (opcional)",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "criar_agendamento",
    description:
      "Cria agendamento apos confirmar: servico, profissional, data, horario e nome.",
    input_schema: {
      type: "object",
      required: ["professional_id", "service_id", "starts_at", "client_name"],
      properties: {
        professional_id: { type: "string", description: "ID do profissional" },
        service_id: { type: "string", description: "ID do servico" },
        starts_at: { type: "string", description: "ISO datetime do inicio" },
        client_name: { type: "string", description: "Nome do cliente" },
      },
    },
  },
  {
    name: "cancelar_agendamento",
    description:
      "Cancela agendamento existente. Sempre oferecer remarcacao antes.",
    input_schema: {
      type: "object",
      required: ["appointment_id"],
      properties: {
        appointment_id: { type: "string", description: "ID do agendamento" },
      },
    },
  },
  {
    name: "listar_servicos",
    description:
      "Lista servicos disponiveis da unidade com precos e duracao.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

interface HandleAgentConversationParams {
  unitId: string;
  unitName: string;
  whatsappInstance: string;
  senderPhone: string;
  pushName: string;
  messageText: string;
  env: Env;
  convHistory: KVNamespace;
}

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  supabase: SupabaseClient,
  unitId: string,
  senderPhone: string,
  clientName: string,
): Promise<string> {
  try {
    switch (toolName) {
      case "consultar_agenda":
        return await consultarAgenda(supabase, unitId, {
          professional_id: input["professional_id"] as string | undefined,
          date: input["date"] as string,
          service_id: input["service_id"] as string | undefined,
        });

      case "criar_agendamento":
        return await criarAgendamento(supabase, unitId, {
          professional_id: input["professional_id"] as string,
          service_id: input["service_id"] as string,
          starts_at: input["starts_at"] as string,
          client_name: (input["client_name"] as string) || clientName,
        });

      case "cancelar_agendamento":
        return await cancelarAgendamento(supabase, {
          appointment_id: input["appointment_id"] as string,
        });

      case "listar_servicos":
        return await listarServicos(supabase, unitId);

      default:
        return JSON.stringify({ error: `Ferramenta desconhecida: ${toolName}` });
    }
  } catch (error) {
    structuredLog("error", "tool_execution_error", {
      tool: toolName,
      error: error instanceof Error ? error.message : String(error),
    });
    return JSON.stringify({
      error: `Erro ao executar ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function handleAgentConversation(
  params: HandleAgentConversationParams,
): Promise<void> {
  const {
    unitId,
    unitName,
    whatsappInstance,
    senderPhone,
    pushName,
    messageText,
    env,
    convHistory,
  } = params;

  const supabase = new SupabaseClient({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const anthropic = new AnthropicClient({
    apiKey: env.ANTHROPIC_API_KEY,
  });

  const evolution = new EvolutionClient({
    apiUrl: env.EVOLUTION_API_URL,
    apiKey: env.EVOLUTION_API_KEY,
  });

  // Build system prompt via RPC
  let systemPrompt: string;
  try {
    systemPrompt = await supabase.rpc<string>("build_agent_prompt", {
      p_unit_id: unitId,
    });
  } catch (error) {
    structuredLog("error", "build_agent_prompt_failed", {
      unitId,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  // Look up client by phone + unitId
  let clientName = pushName;
  try {
    const normalizedPhone = normalizePhone(senderPhone);
    const clients = await supabase.query<Client>("Client", {
      select: "id,name",
      filters: {
        phone: `eq.${normalizedPhone}`,
        unitId: `eq.${unitId}`,
      },
      limit: 1,
    });
    if (clients.length > 0 && clients[0]) {
      clientName = clients[0].name;
    }
  } catch {
    // Client not found, use pushName as fallback
  }

  // Load conversation history from KV
  const previousMessages = await loadHistory(convHistory, unitId, senderPhone);

  // Build messages for Claude
  const messages: ClaudeMessage[] = [
    ...previousMessages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: messageText },
  ];

  const MAX_TOOL_ROUNDS = 5;
  let currentMessages = messages;
  let finalText = "Desculpe, estou com dificuldade para processar. Pode tentar novamente?";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let response;
    try {
      response = await anthropic.createMessage({
        system: systemPrompt,
        messages: currentMessages,
        tools: AGENT_TOOLS,
        max_tokens: 1024,
      });
    } catch (error) {
      structuredLog("error", "anthropic_call_failed", {
        unitId,
        round,
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }

    if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
      finalText = extractText(response) || finalText;
      break;
    }

    if (response.stop_reason === "tool_use" && hasToolUse(response)) {
      const toolBlocks = getToolUseBlocks(response);
      const toolResults: ClaudeContentBlock[] = [];

      for (const block of toolBlocks) {
        if (block.type === "tool_use" && block.name && block.input && block.id) {
          structuredLog("info", "tool_call", {
            unitId,
            tool: block.name,
            round,
          });

          const result = await executeTool(
            block.name,
            block.input,
            supabase,
            unitId,
            senderPhone,
            clientName,
          );

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // Append assistant response and tool results
      currentMessages = [
        ...currentMessages,
        { role: "assistant" as const, content: response.content },
        { role: "user" as const, content: toolResults },
      ];
    }
  }

  // Send response via Evolution API
  try {
    await evolution.sendText(whatsappInstance, senderPhone, finalText);
  } catch (error) {
    structuredLog("error", "evolution_send_failed", {
      unitId,
      phone: senderPhone,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Save updated history to KV (last 20, TTL 24h)
  await saveHistory(convHistory, unitId, senderPhone, [
    ...previousMessages,
    { role: "user", content: messageText },
    { role: "assistant", content: finalText },
  ]);
}
