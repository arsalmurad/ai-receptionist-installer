/**
 * Shared contract between apps/web and workers/llm-gateway. The gateway is
 * the only holder of the LLM provider key - apps/web never sees it, it only
 * holds the shared secret used to authenticate to the gateway.
 */

export const LLM_GATEWAY_SECRET_HEADER = "x-frontdesk-gateway-secret";

export interface LlmGatewayRequest {
  systemPrompt: string;
  userMessage: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface LlmGatewayResponse {
  reply: string;
  provider: "mock" | "gemini" | "openai";
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
