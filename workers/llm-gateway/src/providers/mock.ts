import { CANNOT_ANSWER_FALLBACK, type LlmGatewayRequest, type LlmGatewayResponse } from "@frontdesk-kit/config";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return shared;
}


/**
 * Deterministic provider that answers only from the client's own FAQ list.
 * Used in tests and CI, and as a free default for real deployments that do
 * not want to pay for an LLM call at all.
 */
export function runMockProvider(request: LlmGatewayRequest): LlmGatewayResponse {
  const questionTokens = tokenize(request.userMessage);

  let best: { answer: string; score: number } | undefined;
  for (const entry of request.faq) {
    const score = overlapScore(questionTokens, tokenize(entry.question));
    if (!best || score > best.score) {
      best = { answer: entry.answer, score };
    }
  }

  const MIN_OVERLAP = 2;
  if (best && best.score >= MIN_OVERLAP) {
    return { reply: best.answer, provider: "mock", grounded: true };
  }

  return { reply: CANNOT_ANSWER_FALLBACK, provider: "mock", grounded: false };
}
