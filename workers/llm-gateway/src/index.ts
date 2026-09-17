import { LLM_GATEWAY_SECRET_HEADER, constantTimeEqual, type LlmGatewayRequest } from "@frontdesk-kit/config";
import type { WorkerEnv } from "./env";
import { runMockProvider } from "./providers/mock";
import { runGeminiProvider } from "./providers/gemini";
import { runOpenAiProvider } from "./providers/openai";

function isValidRequest(body: unknown): body is LlmGatewayRequest {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.systemPrompt === "string" &&
    typeof b.userMessage === "string" &&
    Array.isArray(b.history) &&
    Array.isArray(b.faq)
  );
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/chat" || request.method !== "POST") {
      return new Response("not found", { status: 404 });
    }

    const providedSecret = request.headers.get(LLM_GATEWAY_SECRET_HEADER);
    if (!providedSecret || !constantTimeEqual(providedSecret, env.LLM_GATEWAY_SHARED_SECRET)) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!isValidRequest(body)) {
      return new Response(JSON.stringify({ error: "invalid request shape" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    try {
      // forceMock is set only by apps/web, and only after it authenticated
      // the caller's own VERIFY_TOKEN - see packages/config/src/llmGateway.ts.
      const provider = body.forceMock ? "mock" : env.LLM_PROVIDER || "mock";
      const result =
        provider === "gemini"
          ? await runGeminiProvider(body, requireKey(env), env.LLM_MODEL)
          : provider === "openai"
            ? await runOpenAiProvider(body, requireKey(env), env.LLM_MODEL)
            : runMockProvider(body);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
  },
};

function requireKey(env: WorkerEnv): string {
  if (!env.LLM_API_KEY) {
    throw new Error(`LLM_PROVIDER=${env.LLM_PROVIDER} requires LLM_API_KEY to be set`);
  }
  return env.LLM_API_KEY;
}
