import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { targetConfigSchema } from "@frontdesk-kit/config";
import {
  runPortableChecks,
  checkPagesLoad,
  checkConsentGate,
  checkWebhookSignature,
  checkSecretScanDeployed,
  checkRateLimits,
} from "./portableChecks";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  } as Response;
}

describe("target config schema", () => {
  it("accepts a minimal target with only name and baseUrl", () => {
    const result = targetConfigSchema.safeParse({ name: "acme", baseUrl: "https://acme.example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects a target missing baseUrl", () => {
    const result = targetConfigSchema.safeParse({ name: "acme" });
    expect(result.success).toBe(false);
  });
});

describe("checkPagesLoad", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("passes when every path returns 200", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(textResponse("<html></html>"));
    const result = await checkPagesLoad("https://acme.example.com", []);
    expect(result.status).toBe("PASS");
  });

  it("fails when a path does not return 200", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(textResponse("nope", 500));
    const result = await checkPagesLoad("https://acme.example.com", []);
    expect(result.status).toBe("FAIL");
  });
});

describe("checkConsentGate", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("passes on 403 without consent then 200 with consent", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(textResponse("forbidden", 403))
      .mockResolvedValueOnce(jsonResponse({ consentId: "c1", sessionId: "s1" }))
      .mockResolvedValueOnce(jsonResponse({ reply: "hi" }));
    const result = await checkConsentGate("https://acme.example.com");
    expect(result.status).toBe("PASS");
  });

  it("fails when the without-consent request does not return 403", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "should not answer" }, 200));
    const result = await checkConsentGate("https://acme.example.com");
    expect(result.status).toBe("FAIL");
  });
});

describe("checkWebhookSignature", () => {
  it("skips when no Twilio auth token is given", async () => {
    const result = await checkWebhookSignature("https://acme.example.com", undefined);
    expect(result.status).toBe("SKIPPED");
  });
});

describe("checkSecretScanDeployed", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("skips when no names or values are given", async () => {
    const result = await checkSecretScanDeployed("https://acme.example.com", [], []);
    expect(result.status).toBe("SKIPPED");
  });

  it("fails when a secret value appears in a fetched script asset", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(textResponse('<html><script src="/app.js"></script></html>'))
      .mockResolvedValueOnce(textResponse("const key = 'leaked-secret-value-123';"));
    const result = await checkSecretScanDeployed("https://acme.example.com", [], ["leaked-secret-value-123"]);
    expect(result.status).toBe("FAIL");
  });

  it("passes when nothing scanned matches", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(textResponse('<html><script src="/app.js"></script></html>'))
      .mockResolvedValueOnce(textResponse("const safe = 'nothing-secret-here';"));
    const result = await checkSecretScanDeployed("https://acme.example.com", [], ["leaked-secret-value-123"]);
    expect(result.status).toBe("PASS");
  });
});

describe("checkRateLimits", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("passes once a 429 is returned within limit+1 messages", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ consentId: "c1", sessionId: "s1" }));
    for (let i = 0; i < 3; i++) fetchMock.mockResolvedValueOnce(jsonResponse({ reply: "hi" }, 200));
    fetchMock.mockResolvedValueOnce(textResponse("too many", 429));
    const result = await checkRateLimits("https://acme.example.com", 3, undefined);
    expect(result.status).toBe("PASS");
  });

  it("fails when 429 never comes back", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(jsonResponse({ consentId: "c1", sessionId: "s1" }));
    fetchMock.mockResolvedValue(jsonResponse({ reply: "hi" }, 200));
    const result = await checkRateLimits("https://acme.example.com", 2, undefined);
    expect(result.status).toBe("FAIL");
  });
});

describe("runPortableChecks", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("skips every gate that needs credentials not present in a minimal target", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(textResponse("<html><title>Acme</title></html>", 200));

    const target = targetConfigSchema.parse({ name: "acme", baseUrl: "https://acme.example.com" });
    const results = await runPortableChecks(target);

    const byGate = Object.fromEntries(results.map((r) => [r.gate, r.status]));
    expect(byGate["4 voice signature"]).toBe("SKIPPED");
    expect(byGate["5 twilio number"]).toBe("SKIPPED");
    expect(byGate["6 elevenlabs privacy"]).toBe("SKIPPED");
    expect(byGate["7 resend domain"]).toBe("SKIPPED");
    expect(byGate["8 secrets server-only"]).toBe("SKIPPED");
    expect(results).toHaveLength(9);
  });
});
