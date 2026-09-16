import { describe, it, expect } from "vitest";
import { runMockProvider } from "./mock";
import type { LlmGatewayRequest } from "@frontdesk-kit/config";

const faq = [
  { question: "Do you offer free estimates?", answer: "Yes, estimates are free." },
  { question: "Are you licensed and insured?", answer: "Yes, fully licensed and insured." },
];

function request(userMessage: string): LlmGatewayRequest {
  return { systemPrompt: "irrelevant for mock", userMessage, history: [], faq };
}

describe("runMockProvider", () => {
  it("answers from the FAQ when the question clearly matches", () => {
    const result = runMockProvider(request("Do you offer free estimates for new customers?"));
    expect(result.grounded).toBe(true);
    expect(result.reply).toBe("Yes, estimates are free.");
    expect(result.provider).toBe("mock");
  });

  it("falls back and reports ungrounded for an out-of-scope question", () => {
    const result = runMockProvider(request("What is the exact price for a new water heater?"));
    expect(result.grounded).toBe(false);
    expect(result.reply).toMatch(/don't have that information/i);
  });
});
