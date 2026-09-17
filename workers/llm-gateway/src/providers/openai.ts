import { CANNOT_ANSWER_FALLBACK, OUT_OF_SCOPE_MARKER, type LlmGatewayRequest, type LlmGatewayResponse } from "@frontdesk-kit/config";


interface OpenAiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Calls the OpenAI Chat Completions API directly, per
 * https://platform.openai.com/docs/api-reference/chat/create.
 */
export async function runOpenAiProvider(
  request: LlmGatewayRequest,
  apiKey: string,
  model: string,
): Promise<LlmGatewayResponse> {
  const messages: OpenAiMessage[] = [
    { role: "system", content: request.systemPrompt },
    ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user", content: request.userMessage },
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as OpenAiResponse;
  const text = (data.choices?.[0]?.message?.content ?? "").trim();

  if (!text || text.startsWith(OUT_OF_SCOPE_MARKER)) {
    return { reply: CANNOT_ANSWER_FALLBACK, provider: "openai", grounded: false };
  }

  return { reply: text, provider: "openai", grounded: true };
}
