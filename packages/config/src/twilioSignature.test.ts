import { describe, it, expect } from "vitest";
import { computeTwilioSignature, validateTwilioSignature } from "./twilioSignature";

describe("Twilio signature", () => {
  const authToken = "test-token";
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = { Digits: "1234", CallSid: "CA1234567890" };

  it("produces the same signature for the same inputs (deterministic)", async () => {
    const a = await computeTwilioSignature(authToken, url, params);
    const b = await computeTwilioSignature(authToken, url, params);
    expect(a).toBe(b);
  });

  it("is independent of the order params were supplied in (sorted before signing)", async () => {
    const a = await computeTwilioSignature(authToken, url, { Digits: "1234", CallSid: "CA1234567890" });
    const b = await computeTwilioSignature(authToken, url, { CallSid: "CA1234567890", Digits: "1234" });
    expect(a).toBe(b);
  });

  it("validates a correctly signed request", async () => {
    const signature = await computeTwilioSignature(authToken, url, params);
    await expect(validateTwilioSignature(authToken, url, params, signature)).resolves.toBe(true);
  });

  it("rejects a missing signature", async () => {
    await expect(validateTwilioSignature(authToken, url, params, null)).resolves.toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const signature = await computeTwilioSignature(authToken, url, params);
    await expect(validateTwilioSignature(authToken, url, params, signature + "x")).resolves.toBe(false);
  });

  it("rejects a signature computed with the wrong auth token", async () => {
    const signature = await computeTwilioSignature("other-token", url, params);
    await expect(validateTwilioSignature(authToken, url, params, signature)).resolves.toBe(false);
  });

  it("rejects a signature computed for a different URL", async () => {
    const signature = await computeTwilioSignature(authToken, url, params);
    await expect(validateTwilioSignature(authToken, `${url}&tampered=1`, params, signature)).resolves.toBe(false);
  });
});
