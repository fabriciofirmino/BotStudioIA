import { structuredLog } from "./utils.ts";

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
