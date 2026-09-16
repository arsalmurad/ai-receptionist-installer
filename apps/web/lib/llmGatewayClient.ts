import { LLM_GATEWAY_SECRET_HEADER, type LlmGatewayRequest, type LlmGatewayResponse } from "@frontdesk-kit/config";
import { getEnv } from "./env";

export async function askGateway(request: LlmGatewayRequest): Promise<LlmGatewayResponse> {
  const env = getEnv();
  const res = await fetch(`${env.LLM_GATEWAY_URL.replace(/\/$/, "")}/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [LLM_GATEWAY_SECRET_HEADER]: env.LLM_GATEWAY_SHARED_SECRET,
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new Error(`llm-gateway request failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}
