/**
 * Twilio request signature validation, implemented directly from Twilio's
 * "Validating Requests are from Twilio" docs so it works with only an auth
 * token - no account SID, no network call, no Twilio SDK.
 *
 * Algorithm: take the full request URL, append each POST param key+value
 * (sorted by key, no separators), HMAC-SHA1 with the auth token as key,
 * base64-encode, compare to X-Twilio-Signature.
 *
 * Uses Web Crypto (globalThis.crypto.subtle) so the same code runs in a
 * Next.js API route (Node runtime) and in a Cloudflare Worker.
 */

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return toBase64(signatureBuffer);
}

export async function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signatureHeader: string | null | undefined,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const expected = await computeTwilioSignature(authToken, url, params);
  return constantTimeEqual(expected, signatureHeader);
}

export const TWILIO_SIGNATURE_HEADER = "X-Twilio-Signature";
