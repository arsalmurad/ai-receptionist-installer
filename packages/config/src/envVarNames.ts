/**
 * Canonical list of every env var apps/web knows about, split the same way
 * as env.ts, with a one-line human description. Used to generate
 * docs/ENV_CONTRACT.md and to drive `frontdesk provision`'s Vercel env
 * step, so the two never drift apart.
 */
export interface EnvVarSpec {
  name: string;
  required: boolean;
  public: boolean;
  description: string;
}

export const ENV_VAR_SPECS: EnvVarSpec[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true, public: true, description: "Supabase project URL." },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, public: true, description: "Supabase anon key (RLS-scoped, safe to expose)." },
  { name: "NEXT_PUBLIC_SITE_URL", required: false, public: true, description: "This deployment's public URL, used in outgoing links." },

  { name: "SUPABASE_SERVICE_ROLE_KEY", required: true, public: false, description: "Bypasses RLS. Server-only, never NEXT_PUBLIC_." },
  { name: "SUPABASE_PROJECT_REF", required: true, public: false, description: "Used by the CLI to link/push migrations." },
  { name: "SUPABASE_DB_PASSWORD", required: false, public: false, description: "Used by the CLI for non-interactive db push." },
  { name: "CLIENT_ID", required: true, public: false, description: "Selects clients/<id>/config.json for this deployment." },
  { name: "LLM_GATEWAY_URL", required: true, public: false, description: "URL of the deployed llm-gateway Worker." },
  { name: "LLM_GATEWAY_SHARED_SECRET", required: true, public: false, description: "Shared secret between apps/web and llm-gateway." },
  { name: "VERIFY_TOKEN", required: false, public: false, description: "Lets frontdesk verify/simulate-call identify themselves to the chat route so their requests use a separate rate-limit namespace and a mock reply instead of spending the public Gemini quota." },

  { name: "TWILIO_ACCOUNT_SID", required: false, public: false, description: "Enables Twilio REST provisioning. Optional - voice webhooks work without it." },
  { name: "TWILIO_AUTH_TOKEN", required: false, public: false, description: "Enables X-Twilio-Signature verification on voice webhooks." },
  { name: "TWILIO_PHONE_NUMBER_SID", required: false, public: false, description: "The Twilio phone number resource to point at this deployment." },

  { name: "ELEVENLABS_API_KEY", required: false, public: false, description: "Enables the ElevenLabs agent handoff and provisioning." },
  { name: "ELEVENLABS_AGENT_ID", required: false, public: false, description: "Existing agent (created from the Blank template) that provision configures." },

  { name: "RESEND_API_KEY", required: false, public: false, description: "Enables owner email notifications." },
  { name: "RESEND_FROM_DOMAIN", required: false, public: false, description: "Verified sending domain for owner notifications." },
  { name: "OWNER_NOTIFICATION_EMAIL", required: false, public: false, description: "Override for the owner alert recipient (defaults to the client config value)." },
  { name: "OWNER_FALLBACK_PHONE", required: false, public: false, description: "Number dialed when the AI agent cannot be reached." },

  { name: "MEDIA_GATE_URL", required: false, public: false, description: "URL of the deployed media-gate Worker." },
  { name: "MEDIA_GATE_SIGNING_SECRET", required: false, public: false, description: "Shared secret for signed media URLs." },

  { name: "CLOUDFLARE_ACCOUNT_ID", required: false, public: false, description: "Used by the CLI to deploy Workers." },
  { name: "CLOUDFLARE_API_TOKEN", required: false, public: false, description: "Used by CI to deploy Workers non-interactively." },

  { name: "CHAT_RATE_LIMIT_PER_IP", required: false, public: false, description: "Chat messages allowed per IP per window. Default 10." },
  { name: "CHAT_RATE_LIMIT_WINDOW_MS", required: false, public: false, description: "Chat per-IP window length in milliseconds. Default 600000 (10 minutes)." },
  { name: "CHAT_RATE_LIMIT_DAILY", required: false, public: false, description: "Chat messages allowed across all visitors per day. Default 200." },
  { name: "VERIFY_RATE_LIMIT_PER_IP", required: false, public: false, description: "Verify-token chat messages allowed per IP per window. Default 5." },
  { name: "VERIFY_RATE_LIMIT_DAILY", required: false, public: false, description: "Verify-token chat messages allowed per day, separate from the public daily quota. Default 50." },
  { name: "VOICE_RATE_LIMIT_PER_IP", required: false, public: false, description: "Voice webhook requests allowed per IP per window. Default 20." },
  { name: "VOICE_RATE_LIMIT_WINDOW_MS", required: false, public: false, description: "Voice per-IP window length in milliseconds. Default 600000." },
  { name: "OWNER_EMAIL_DAILY_CAP", required: false, public: false, description: "Owner notification emails allowed per day. Default 20; leads are still saved past the cap, only the email is skipped." },
  { name: "WEB_VOICE_RATE_LIMIT_PER_IP", required: false, public: false, description: "Browser voice demo sessions allowed per IP per window. Default 3." },
  { name: "WEB_VOICE_RATE_LIMIT_WINDOW_MS", required: false, public: false, description: "Browser voice demo per-IP window length in milliseconds. Default 600000." },
  { name: "WEB_VOICE_DAILY_CAP", required: false, public: false, description: "Browser voice demo sessions allowed across all visitors per day. Default 30." },
];
