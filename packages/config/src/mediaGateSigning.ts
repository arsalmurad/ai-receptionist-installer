/**
 * HMAC-signed expiring URLs for workers/media-gate. Any URL missing a valid,
 * unexpired signature is rejected. Uses Web Crypto so the same code runs in
 * apps/web (Node) and the Worker (V8 isolate).
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(sig);
}

export interface SignedUrlParts {
  path: string;
  expiresAtEpochSeconds: number;
  signature: string;
}

export async function signMediaPath(
  secret: string,
  path: string,
  expiresAtEpochSeconds: number,
): Promise<string> {
  return hmacHex(secret, `${path}:${expiresAtEpochSeconds}`);
}

export async function buildSignedMediaUrl(
  secret: string,
  baseUrl: string,
  path: string,
  ttlSeconds: number,
  now: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const expiresAtEpochSeconds = now + ttlSeconds;
  const signature = await signMediaPath(secret, path, expiresAtEpochSeconds);
  const url = new URL(path, baseUrl);
  url.searchParams.set("exp", String(expiresAtEpochSeconds));
  url.searchParams.set("sig", signature);
  return url.toString();
}

export type MediaUrlVerification =
  | { ok: true }
  | { ok: false; reason: "missing_params" | "expired" | "bad_signature" };

export async function verifyMediaUrl(
  secret: string,
  path: string,
  searchParams: URLSearchParams,
  now: number = Math.floor(Date.now() / 1000),
): Promise<MediaUrlVerification> {
  const expParam = searchParams.get("exp");
  const sigParam = searchParams.get("sig");
  if (!expParam || !sigParam) return { ok: false, reason: "missing_params" };

  const expiresAtEpochSeconds = Number(expParam);
  if (!Number.isFinite(expiresAtEpochSeconds) || expiresAtEpochSeconds < now) {
    return { ok: false, reason: "expired" };
  }

  const expected = await signMediaPath(secret, path, expiresAtEpochSeconds);
  if (!constantTimeEqual(expected, sigParam)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
