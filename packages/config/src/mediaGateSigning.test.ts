import { describe, it, expect } from "vitest";
import { signMediaPath, verifyMediaUrl } from "./mediaGateSigning";

describe("media-gate signed URLs", () => {
  const secret = "test-secret-0123456789";
  const path = "/clients/demo/call-123.txt";

  it("accepts a valid, unexpired signature", async () => {
    const now = 1_000_000;
    const exp = now + 300;
    const sig = await signMediaPath(secret, path, exp);
    const params = new URLSearchParams({ exp: String(exp), sig });
    await expect(verifyMediaUrl(secret, path, params, now)).resolves.toEqual({ ok: true });
  });

  it("rejects a missing signature", async () => {
    const params = new URLSearchParams({ exp: "2000000" });
    const result = await verifyMediaUrl(secret, path, params, 1_000_000);
    expect(result).toEqual({ ok: false, reason: "missing_params" });
  });

  it("rejects an expired signature", async () => {
    const now = 1_000_000;
    const exp = now - 10;
    const sig = await signMediaPath(secret, path, exp);
    const params = new URLSearchParams({ exp: String(exp), sig });
    const result = await verifyMediaUrl(secret, path, params, now);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a tampered signature", async () => {
    const now = 1_000_000;
    const exp = now + 300;
    const sig = await signMediaPath(secret, path, exp);
    const params = new URLSearchParams({ exp: String(exp), sig: `${sig}x` });
    const result = await verifyMediaUrl(secret, path, params, now);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a signature for a different path", async () => {
    const now = 1_000_000;
    const exp = now + 300;
    const sig = await signMediaPath(secret, path, exp);
    const params = new URLSearchParams({ exp: String(exp), sig });
    const result = await verifyMediaUrl(secret, "/clients/demo/call-999.txt", params, now);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });
});
