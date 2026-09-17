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

const hostname = "acme.example.com";

function matchingAgent(desired: ReturnType<typeof buildDesiredAgentState>) {
  return {
    agent_id: "a1",
    conversation_config: {
      agent: {
        first_message: desired.firstMessage,
        prompt: {
          prompt: desired.systemPrompt,
          built_in_tools: { skip_turn: { type: "system", name: "skip_turn", params: { system_tool_type: "skip_turn" } } },
        },
      },
      conversation: { max_duration_seconds: desired.maxDurationSeconds },
      turn: { turn_eagerness: desired.turnEagerness, turn_timeout: desired.turnTimeoutSeconds },
    },
    platform_settings: {
      privacy: { record_voice: false },
      auth: { enable_auth: true, allowlist: [{ hostname }] },
    },
  };
}

describe("agentMatchesDesired", () => {
  it("is true only when every field, including turn eagerness, turn timeout, and skip_turn, matches", () => {
    const desired = buildDesiredAgentState(config, hostname);
    const matching = matchingAgent(desired);
    expect(agentMatchesDesired(matching, desired)).toBe(true);

    const wrongPrompt = {
      ...matching,
      conversation_config: { ...matching.conversation_config, agent: { ...matching.conversation_config.agent, prompt: { ...matching.conversation_config.agent.prompt, prompt: "different" } } },
    };
    expect(agentMatchesDesired(wrongPrompt, desired)).toBe(false);

    const audioOn = { ...matching, platform_settings: { ...matching.platform_settings, privacy: { record_voice: true } } };
    expect(agentMatchesDesired(audioOn, desired)).toBe(false);

    const authOff = { ...matching, platform_settings: { ...matching.platform_settings, auth: { enable_auth: false, allowlist: [{ hostname }] } } };
    expect(agentMatchesDesired(authOff, desired)).toBe(false);

    const missingHostname = { ...matching, platform_settings: { ...matching.platform_settings, auth: { enable_auth: true, allowlist: [] } } };
    expect(agentMatchesDesired(missingHostname, desired)).toBe(false);

    const wrongDuration = { ...matching, conversation_config: { ...matching.conversation_config, conversation: { max_duration_seconds: 600 } } };
    expect(agentMatchesDesired(wrongDuration, desired)).toBe(false);

    const wrongEagerness = { ...matching, conversation_config: { ...matching.conversation_config, turn: { ...matching.conversation_config.turn, turn_eagerness: "eager" as const } } };
    expect(agentMatchesDesired(wrongEagerness, desired)).toBe(false);

    const wrongTimeout = { ...matching, conversation_config: { ...matching.conversation_config, turn: { ...matching.conversation_config.turn, turn_timeout: 3 } } };
    expect(agentMatchesDesired(wrongTimeout, desired)).toBe(false);

    const noSkipTurn = {
      ...matching,
      conversation_config: { ...matching.conversation_config, agent: { ...matching.conversation_config.agent, prompt: { prompt: desired.systemPrompt, built_in_tools: { skip_turn: null } } } },
    };
    expect(agentMatchesDesired(noSkipTurn, desired)).toBe(false);
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
    const desired = buildDesiredAgentState(config, hostname);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => matchingAgent(desired) });

    const result = await ensureAgentConfigured("key", "a1", config, hostname);
    expect(result.changed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("PATCHes with turn eagerness, turn timeout, and skip_turn enabled when out of date", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agent_id: "a1", conversation_config: { agent: { first_message: "old", prompt: { prompt: "old" } } }, platform_settings: { privacy: { record_voice: true } } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ agent_id: "a1" }) });

    const result = await ensureAgentConfigured("key", "a1", config, hostname);
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
    expect(body.conversation_config.agent.prompt.prompt).toContain("skip_turn");
    expect(body.conversation_config.conversation.max_duration_seconds).toBe(120);
    expect(body.conversation_config.turn.turn_eagerness).toBe("patient");
    expect(body.conversation_config.turn.turn_timeout).toBe(10);
    expect(body.conversation_config.agent.prompt.built_in_tools.skip_turn).toEqual({
      type: "system",
      name: "skip_turn",
      params: { system_tool_type: "skip_turn" },
    });
    expect(body.platform_settings.privacy.record_voice).toBe(false);
    expect(body.platform_settings.auth.enable_auth).toBe(true);
    expect(body.platform_settings.auth.allowlist).toEqual([{ hostname }]);
  });
});
