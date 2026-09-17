import { z } from "zod";

/**
 * Env contract for apps/web.
 *
 * Split follows the Next.js build-time rule: only NEXT_PUBLIC_* variables are
 * inlined into the client bundle. Everything else stays server-only. See
 * docs/DESIGN_NOTES.md (NEXT_PUBLIC leakage finding) for why this is a
 * separate schema instead of one flat object.
 *
 * The LLM API key is deliberately absent here. Only workers/llm-gateway
 * holds it (see workers/llm-gateway/src/env.ts).
 */

const requiredServerSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SUPABASE_PROJECT_REF: z.string().min(1, "SUPABASE_PROJECT_REF is required"),
  CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
  LLM_GATEWAY_URL: z.string().url("LLM_GATEWAY_URL must be a URL"),
  LLM_GATEWAY_SHARED_SECRET: z.string().min(16, "LLM_GATEWAY_SHARED_SECRET must be at least 16 characters"),
});

const optionalServerSchema = z.object({
  SUPABASE_DB_PASSWORD: z.string().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER_SID: z.string().optional(),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_AGENT_ID: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_DOMAIN: z.string().optional(),
  OWNER_NOTIFICATION_EMAIL: z.string().email().optional(),
  OWNER_FALLBACK_PHONE: z.string().optional(),

  MEDIA_GATE_URL: z.string().url().optional(),
  MEDIA_GATE_SIGNING_SECRET: z.string().min(16).optional(),

  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),

  VERCEL_URL: z.string().optional(),

  // Rate limit tuning - all optional, sensible defaults live next to where
  // each is read. See docs/DESIGN_NOTES.md for why these exist.
  CHAT_RATE_LIMIT_PER_IP: z.string().optional(),
  CHAT_RATE_LIMIT_WINDOW_MS: z.string().optional(),
  CHAT_RATE_LIMIT_DAILY: z.string().optional(),
  VOICE_RATE_LIMIT_PER_IP: z.string().optional(),
  VOICE_RATE_LIMIT_WINDOW_MS: z.string().optional(),
  OWNER_EMAIL_DAILY_CAP: z.string().optional(),
  WEB_VOICE_RATE_LIMIT_PER_IP: z.string().optional(),
  WEB_VOICE_RATE_LIMIT_WINDOW_MS: z.string().optional(),
  WEB_VOICE_DAILY_CAP: z.string().optional(),
});

const requiredPublicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

const optionalPublicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

export const serverEnvSchema = requiredServerSchema.merge(optionalServerSchema);
export const publicEnvSchema = requiredPublicSchema.merge(optionalPublicSchema);
export const appEnvSchema = serverEnvSchema.merge(publicEnvSchema);

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type AppEnv = z.infer<typeof appEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public issues: z.ZodIssue[]) {
    const lines = issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    super(`Invalid environment configuration:\n${lines.join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Validates an env source (normally process.env, passed explicitly by the
 * caller) against the full app env contract. Throws EnvValidationError with
 * every missing/invalid var listed at once, so a build fails loudly instead
 * of one var at a time. Takes no default so this file has no Node-specific
 * globals - it is imported (via @frontdesk-kit/config) from the Cloudflare
 * Workers too, which typecheck without Node's ambient types.
 */
export function loadAppEnv(source: Record<string, string | undefined>): AppEnv {
  const result = appEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}

export interface FeatureFlags {
  /** TWILIO_AUTH_TOKEN is set: incoming webhooks can be signature-verified. */
  twilioSignatureVerification: boolean;
  /** TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN are set: the Twilio REST API can be called. */
  twilioProvisioning: boolean;
  elevenLabs: boolean;
  resend: boolean;
  mediaGate: boolean;
}

/**
 * Optional integrations report themselves as disabled instead of failing the
 * build when credentials are missing, per the build spec. Signature
 * verification and REST provisioning are split because the demo deploy has
 * an auth token (so webhooks can be verified/simulated) but no account SID
 * (so real API calls are skipped) - see README "no Twilio account" section.
 */
export function computeFeatureFlags(env: Pick<AppEnv,
  "TWILIO_ACCOUNT_SID" | "TWILIO_AUTH_TOKEN" |
  "ELEVENLABS_API_KEY" | "ELEVENLABS_AGENT_ID" |
  "RESEND_API_KEY" | "RESEND_FROM_DOMAIN" |
  "MEDIA_GATE_URL" | "MEDIA_GATE_SIGNING_SECRET"
>): FeatureFlags {
  return {
    twilioSignatureVerification: Boolean(env.TWILIO_AUTH_TOKEN),
    twilioProvisioning: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
    elevenLabs: Boolean(env.ELEVENLABS_API_KEY && env.ELEVENLABS_AGENT_ID),
    resend: Boolean(env.RESEND_API_KEY && env.RESEND_FROM_DOMAIN),
    mediaGate: Boolean(env.MEDIA_GATE_URL && env.MEDIA_GATE_SIGNING_SECRET),
  };
}
