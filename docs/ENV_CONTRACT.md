# Environment variable contract

Source of truth: `packages/config/src/env.ts` (validation) and
`packages/config/src/envVarNames.ts` (this table). If they ever disagree,
the code wins - this file is documentation, not the schema.

The Next.js build (`apps/web/next.config.ts`) calls `loadAppEnv(process.env)`
before anything else runs, and fails the build immediately, listing every
missing or invalid required variable at once, if any required variable is
missing or malformed. Optional variables gate a whole integration on/off
(see "Feature flags" below) instead of failing the build.

Only `NEXT_PUBLIC_*` variables are ever sent to the browser. Everything else
is server-only. The LLM provider key is not in this table at all - it is
never seen by `apps/web`, only by `workers/llm-gateway` (see its own
`wrangler.toml` and `src/env.ts`).

## Public (sent to the browser)

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key. Safe to expose - RLS scopes everything it can read. |
| `NEXT_PUBLIC_SITE_URL` | no | This deployment's public URL, used in outgoing links (e.g. owner emails). |

## Server-only

| Variable | Required | Description |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Bypasses RLS entirely. Never prefix with `NEXT_PUBLIC_`. |
| `SUPABASE_PROJECT_REF` | yes | Used by the CLI to link and push migrations. |
| `SUPABASE_DB_PASSWORD` | no | Used by the CLI for non-interactive `supabase db push`. Provisioning's migration step is skipped without it. |
| `CLIENT_ID` | yes | Selects `clients/<id>/config.json` for this deployment. |
| `LLM_GATEWAY_URL` | yes | URL of the deployed `llm-gateway` Worker. |
| `LLM_GATEWAY_SHARED_SECRET` | yes | Shared secret between `apps/web` and `llm-gateway`. Min 16 characters. |
| `TWILIO_ACCOUNT_SID` | no | Enables Twilio REST provisioning (number config). Without it, that provision/verify step is skipped, never failed. |
| `TWILIO_AUTH_TOKEN` | no | Enables `X-Twilio-Signature` verification on the voice webhooks. This is the one credential the demo deployment does have, using a test value, so the signature-verification path is fully exercised without a real Twilio account. |
| `TWILIO_PHONE_NUMBER_SID` | no | The Twilio phone number resource `frontdesk provision` points at this deployment. |
| `TWILIO_FALLBACK_TWIML_URL` | no | The Twilio-hosted TwiML Bin URL from docs/FALLBACK_TWIML.md, set as the number's Fallback URL. |
| `ELEVENLABS_API_KEY` | no | Enables the ElevenLabs agent handoff and provisioning. |
| `ELEVENLABS_AGENT_ID` | no | An existing agent (created from the Blank template in the ElevenLabs dashboard) that `frontdesk provision` configures. Never created by this project. |
| `RESEND_API_KEY` | no | Enables owner email notifications. |
| `RESEND_FROM_DOMAIN` | no | Verified sending domain for owner notifications. |
| `OWNER_NOTIFICATION_EMAIL` | no | Override for the alert recipient. Defaults to the client config's `ownerNotificationEmail`. |
| `OWNER_FALLBACK_PHONE` | no | Number dialed by the fallback TwiML when the AI agent can't be reached. |
| `MEDIA_GATE_URL` | no | URL of the deployed `media-gate` Worker. |
| `MEDIA_GATE_SIGNING_SECRET` | no | Shared secret for HMAC-signed, expiring media URLs. Min 16 characters. |
| `CLOUDFLARE_ACCOUNT_ID` | no | Used by the CLI to deploy Workers. |
| `CLOUDFLARE_API_TOKEN` | no | Used by CI to deploy Workers non-interactively (the local CLI can instead rely on an already-`wrangler login`'d session). |

## Feature flags

`packages/config/src/env.ts` (`computeFeatureFlags`) derives these from the
table above. A feature reports itself as disabled - in the dashboard, in
`frontdesk verify`'s SKIPPED rows, and in the README's tested-vs-not table -
rather than the app crashing:

- `twilioSignatureVerification` - `TWILIO_AUTH_TOKEN` set.
- `twilioProvisioning` - `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` both set.
- `elevenLabs` - `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` both set.
- `resend` - `RESEND_API_KEY` and `RESEND_FROM_DOMAIN` both set.
- `mediaGate` - `MEDIA_GATE_URL` and `MEDIA_GATE_SIGNING_SECRET` both set.

## Local development

There is one `.env.local` at the repo root, not one per workspace. It is
never committed (see `.gitignore`). `apps/web`'s `dev`/`build`/`start`
scripts and the CLI both load it explicitly at startup
(`apps/web/scripts/with-root-env.ts`, `packages/cli/src/lib/env.ts`) because
Next.js's built-in `.env` loading only looks in its own working directory,
which in this npm-workspaces layout is `apps/web`, not the repo root.
