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
  /** Structured FAQ, used by the mock provider so it does not have to parse systemPrompt text. */
  faq: Array<{ question: string; answer: string }>;
}

export interface LlmGatewayResponse {
  reply: string;
  provider: "mock" | "gemini" | "openai";
  /** false if the model (or the mock matcher) could not ground the answer in the client FAQ. */
  grounded: boolean;
}

/**
 * The model is told to emit this exact marker instead of guessing when the
 * question is outside the client config. The gateway strips it and reports
 * grounded: false so apps/web can show one fixed fallback message rather
 * than trusting the model's own wording - see RESEARCH.md 1.4 (fact
 * degradation under social pressure) and 1.5 (resolution illusion), cited
 * in docs/DESIGN_NOTES.md.
 */
export const OUT_OF_SCOPE_MARKER = "OUT_OF_SCOPE";

/**
 * The one fixed sentence shown whenever the assistant cannot answer from the
 * client config - whether the model said OUT_OF_SCOPE, or the gateway call
 * itself failed (a provider outage or quota limit). Same message either way,
 * on purpose: a caller should never be able to tell a backend failure apart
 * from a genuine "that's not something I know," and the system should never
 * invent an answer to cover for either one.
 */
export const CANNOT_ANSWER_FALLBACK =
  "I don't have that information from what I was given. Let me take your name and a way to reach you so the team can follow up.";

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
