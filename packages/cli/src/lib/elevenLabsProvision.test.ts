import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ClientConfig } from "@frontdesk-kit/config";
import { agentMatchesDesired, buildDesiredAgentState, ensureAgentConfigured } from "./elevenLabsProvision";

const config: ClientConfig = {
  clientId: "acme",
  businessName: "Acme Plumbing",
  timezone: "America/New_York",
  phoneDisplay: "555",
  hours: [{ day: "mon", open: "08:00", close: "17:00" }],
  services: [{ name: "Drain cleaning", description: "x" }],
  serviceArea: ["Acme City"],
  pricesPolicy: { listedPrices: false, note: "We quote on site." },
  faq: [{ question: "Free estimates?", answer: "Yes." }],
  emergencyRules: [],
  ownerNotificationEmail: "owner@example.com",
  disclosureVersion: "v1",
};

describe("agentMatchesDesired", () => {
  it("is true only when first message, prompt, and audio saving all match", () => {
    const desired = buildDesiredAgentState(config);
    const matching = {
      agent_id: "a1",
      conversation_config: { agent: { first_message: desired.firstMessage, prompt: { prompt: desired.systemPrompt } } },
      platform_settings: { privacy: { record_voice: false } },
    };
    expect(agentMatchesDesired(matching, desired)).toBe(true);

    const wrongPrompt = { ...matching, conversation_config: { agent: { first_message: desired.firstMessage, prompt: { prompt: "different" } } } };
    expect(agentMatchesDesired(wrongPrompt, desired)).toBe(false);

    const audioOn = { ...matching, platform_settings: { privacy: { record_voice: true } } };
    expect(agentMatchesDesired(audioOn, desired)).toBe(false);
  });
});

describe("ensureAgentConfigured (mocked ElevenLabs API)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not PATCH when already configured correctly (idempotent)", async () => {
    const desired = buildDesiredAgentState(config);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agent_id: "a1",
        conversation_config: { agent: { first_message: desired.firstMessage, prompt: { prompt: desired.systemPrompt } } },
        platform_settings: { privacy: { record_voice: false } },
      }),
    });

    const result = await ensureAgentConfigured("key", "a1", config);
    expect(result.changed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("PATCHes with the disclosure line, grounded prompt, and audio saving off when out of date", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agent_id: "a1", conversation_config: { agent: { first_message: "old", prompt: { prompt: "old" } } }, platform_settings: { privacy: { record_voice: true } } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ agent_id: "a1" }) });

    const result = await ensureAgentConfigured("key", "a1", config);
    expect(result.changed).toBe(true);

    const [updateUrl, updateInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(updateUrl).toBe("https://api.elevenlabs.io/v1/convai/agents/a1");
    expect(updateInit.method).toBe("PATCH");
    const headers = updateInit.headers as Record<string, string>;
    expect(headers["xi-api-key"]).toBe("key");

    const body = JSON.parse(updateInit.body as string);
    expect(body.conversation_config.agent.first_message).toContain("Acme Plumbing");
    expect(body.conversation_config.agent.first_message).toContain("recorded line");
    expect(body.conversation_config.agent.prompt.prompt).toContain("Free estimates?");
    expect(body.platform_settings.privacy.record_voice).toBe(false);
  });
});
