import type { LlmGatewayRequest, LlmGatewayResponse } from "@frontdesk-kit/config";
import { OUT_OF_SCOPE_MARKER } from "@frontdesk-kit/config";

const FALLBACK_REPLY =
  "I don't have that information from what I was given. Let me take your name and a way to reach you so the team can follow up.";

interface GeminiContentPart {
  text: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiContentPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiContentPart[] };
  }>;
}

/**
 * Calls the Gemini API generateContent endpoint directly, per
 * https://ai.google.dev/api/generate-content (REST). Model comes from
 * LLM_MODEL so any Gemini model id works without a code change.
 */
export async function runGeminiProvider(
  request: LlmGatewayRequest,
  apiKey: string,
  model: string,
): Promise<LlmGatewayResponse> {
  const contents: GeminiContent[] = [
    ...request.history.map((turn) => ({
      role: turn.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: turn.content }],
    })),
    { role: "user", parts: [{ text: request.userMessage }] },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: request.systemPrompt }] },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  const trimmed = text.trim();

  if (!trimmed || trimmed.startsWith(OUT_OF_SCOPE_MARKER)) {
    return { reply: FALLBACK_REPLY, provider: "gemini", grounded: false };
  }

  return { reply: trimmed, provider: "gemini", grounded: true };
}
