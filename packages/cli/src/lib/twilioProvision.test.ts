import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { needsTwilioUpdate, buildDesiredUrls, ensureTwilioVoiceUrls } from "./twilioProvision";
import type { IncomingPhoneNumber } from "@frontdesk-kit/config";

describe("buildDesiredUrls", () => {
  it("builds the incoming voice URL from the site URL and uses the given fallback TwiML Bin URL as-is", () => {
    const desired = buildDesiredUrls("https://demo.example.com/", "https://handler.twilio.com/twiml/BIN123");
    expect(desired.voiceUrl).toBe("https://demo.example.com/api/voice/incoming");
    expect(desired.voiceFallbackUrl).toBe("https://handler.twilio.com/twiml/BIN123");
  });
});

describe("needsTwilioUpdate", () => {
  const desired = { voiceUrl: "https://a.example.com/api/voice/incoming", voiceFallbackUrl: "https://handler.twilio.com/twiml/BIN1" };

  it("is false when both URLs already match", () => {
    const current: IncomingPhoneNumber = {
      sid: "PN123",
      phone_number: "+15550001111",
      voice_url: desired.voiceUrl,
      voice_fallback_url: desired.voiceFallbackUrl,
    };
    expect(needsTwilioUpdate(current, desired)).toBe(false);
  });

  it("is true when the voice URL differs", () => {
    const current: IncomingPhoneNumber = {
      sid: "PN123",
      phone_number: "+15550001111",
      voice_url: "https://old.example.com/incoming",
      voice_fallback_url: desired.voiceFallbackUrl,
    };
    expect(needsTwilioUpdate(current, desired)).toBe(true);
  });
});

describe("ensureTwilioVoiceUrls (mocked Twilio API)", () => {
  const accountSid = "AC_test";
  const authToken = "test-token";
  const phoneNumberSid = "PN_test";
  const desired = { voiceUrl: "https://a.example.com/api/voice/incoming", voiceFallbackUrl: "https://handler.twilio.com/twiml/BIN1" };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call update when the current config already matches (idempotent)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sid: phoneNumberSid,
        phone_number: "+15550001111",
        voice_url: desired.voiceUrl,
        voice_fallback_url: desired.voiceFallbackUrl,
      }),
    });

    const result = await ensureTwilioVoiceUrls(accountSid, authToken, phoneNumberSid, desired);

    expect(result.changed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the GET, no POST update
  });

  it("calls the correct update endpoint with the correct params when values differ", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sid: phoneNumberSid,
          phone_number: "+15550001111",
          voice_url: "https://old.example.com/incoming",
          voice_fallback_url: "https://old.example.com/fallback",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sid: phoneNumberSid,
          phone_number: "+15550001111",
          voice_url: desired.voiceUrl,
          voice_fallback_url: desired.voiceFallbackUrl,
        }),
      });

    const result = await ensureTwilioVoiceUrls(accountSid, authToken, phoneNumberSid, desired);

    expect(result.changed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [updateUrl, updateInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(updateUrl).toBe(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`);
    expect(updateInit.method).toBe("POST");

    const body = new URLSearchParams(updateInit.body as string);
    expect(body.get("VoiceUrl")).toBe(desired.voiceUrl);
    expect(body.get("VoiceFallbackUrl")).toBe(desired.voiceFallbackUrl);
    expect(body.get("VoiceMethod")).toBe("POST");
    expect(body.get("VoiceFallbackMethod")).toBe("POST");

    const headers = updateInit.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^Basic /);
  });
});
