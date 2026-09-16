# Design notes

Every decision below is driven by a specific finding in RESEARCH.md or by a
vendor doc that differed from the original build spec. Findings without a
clear source in RESEARCH.md were not used.

## From RESEARCH.md

**Universal safe-harbor disclosure line (RESEARCH.md 3.4).** Both the voice
route and the chat widget open with an explicit AI disclosure before any
substantive exchange. The exact voice wording ("I am their AI receptionist
on a recorded line") is taken close to verbatim from the research, because it
is designed to simultaneously satisfy Utah's regulated-occupation duty,
California's BOTS Act, Maine's aural-bot law, and all-party call-recording
consent in one sentence. See `packages/config/src/disclosure.ts`.

**Fact degradation under social pressure (RESEARCH.md 1.4) and the
resolution illusion (RESEARCH.md 1.5).** The chat/voice assistant is
grounded only in `clients/<id>/config.json` and is instructed to emit a
literal `OUT_OF_SCOPE` marker instead of improvising when a question falls
outside that config (prices, bookings, anything not listed). The gateway
strips the marker and substitutes one fixed, backend-owned fallback
sentence, rather than trusting whatever wording the model produced - so a
model that drifts under pressure cannot quietly soften a fact. See
`packages/config/src/clientConfig.ts` (`buildSystemPrompt`) and
`workers/llm-gateway/src/providers/*.ts`.

**Synchronous, direct-system writes (RESEARCH.md 2.1).** When the assistant
can't answer, the API route inserts the lead row and sends the owner
notification email in the same request/response cycle, before replying to
the user - not queued for later. `leadCaptured` is reported back to the
caller honestly; if the write fails, the UI does not claim the lead was
saved. See `apps/web/app/api/chat/message/route.ts`.

**Owner notification content (RESEARCH.md 2.3).** Notifications are a short
structured summary (source, name/phone/message), not a raw transcript dump,
addressed to the business owner's email from the client config.

**Emergency keyword handling (RESEARCH.md throughout section 1 and 2.3).**
`clients/<id>/config.json` has an `emergencyRules` list (keyword ->
instruction) that is included in the system prompt ahead of the general FAQ,
so urgent situations (a burst pipe, a gas smell) get a different response
than a routine question.

**RLS InitPlan optimization (RESEARCH.md 5.1).** Every RLS policy wraps
`auth.uid()` in `(select auth.uid())` so Postgres evaluates it once per query
(an InitPlan) instead of once per row. See
`supabase/migrations/20260916120000_core_schema.sql`.

**NEXT_PUBLIC_ leakage (RESEARCH.md 5.2).** `packages/config/src/env.ts`
splits the env contract into a public schema (only `NEXT_PUBLIC_*` names) and
a server schema, and the LLM provider key is never in either - only
`workers/llm-gateway` holds it. `frontdesk verify` gate 8 scans the actual
built `.next/static` output for both the names and the live values of every
server-only secret, so this is checked against what Next.js really produced,
not just against the schema split.

**Resend domain monitoring (RESEARCH.md 6.1).** `frontdesk verify` gate 7 and
`frontdesk doctor` both read the domain status back from the Resend API and
flag anything other than `verified`, instead of assuming DNS stays correct
forever.

**Webhook rot / fleet drift (RESEARCH.md 6.2).** `frontdesk doctor` compares
the live Twilio voice URL, ElevenLabs agent settings, Resend domain status,
and required Vercel env vars against what the client's config and the env
contract say they should be, and reports drift instead of assuming
yesterday's provisioning still holds.

## Vendor docs that differed from the original build spec

**ElevenLabs' primary documented Twilio path is not usable here.** The
main ElevenLabs Twilio integration doc describes importing the Twilio phone
number directly into the ElevenLabs dashboard, which hands your whole
number's webhook config to ElevenLabs and bypasses any server of your own.
That is incompatible with the requirement that our own webhook validate the
Twilio signature, log consent, and write `call_logs` before handoff. Instead
this project uses ElevenLabs' `POST /v1/convai/twilio/register-call`
endpoint (documented separately under "register-call"), which keeps our
webhook in control and returns TwiML we can wrap with our own `<Say>`
disclosure before connecting the call. See
`packages/config/src/elevenLabsClient.ts` and
`apps/web/app/api/voice/incoming/route.ts`.

**ElevenLabs authenticates with `xi-api-key`, not a Bearer token.** Some
secondary doc pages describe a generic "Bearer token", but the authoritative
authentication page is explicit that every REST call uses an `xi-api-key`
header.

**Next.js 16 renamed the `middleware.ts` convention to `proxy.ts`.** The
build was started against `middleware.ts`; the Next.js 16.3.5 build output
flagged it as deprecated with a codemod pointer, so it was renamed
(`apps/web/proxy.ts`, exporting `proxy` instead of `middleware`) before
first deploy.

**Vercel CLI must run from the repo root in a monorepo, not the app
subdirectory.** Vercel's monorepo docs are explicit: "Vercel CLI should not
be invoked from the subdirectory." `frontdesk provision`, `deploy.yml`, and
local `vercel link`/`vercel env`/`vercel build`/`vercel deploy` commands all
run from the repo root; the linked project's Root Directory setting (set to
`apps/web`) tells Vercel where the app actually lives.

**Vercel env vars added as `sensitive` cannot be read back.** `vercel env
add` defaults production/preview values to `sensitive`, which the CLI itself
cannot list or diff later. `frontdesk provision` always re-adds with
`--force` rather than trying to diff against the current value first, so the
step is idempotent in effect (the end state is always correct) even though
it cannot literally skip a no-op write the way the Twilio and ElevenLabs
steps do.

## Other decisions

**One shared Supabase project, one Vercel project per client.** Tenant
isolation is enforced at the database layer (`tenant_id` + RLS on every
table), not by giving each client a separate database. Each client still
gets its own Vercel deployment (so it can carry its own domain), selected at
build time by the `CLIENT_ID` env var, which is validated against
`clients/<id>/config.json` before the Next.js build even starts (see
`apps/web/scripts/generate-client-config.ts`).

**`workers/llm-gateway` and `workers/media-gate` are shared infrastructure,
deployed once, not per client.** The client's system prompt and FAQ are sent
in the request body by `apps/web`, not baked into the Worker, so one
deployment serves every client.

**The voice route always speaks its own disclosure line, even though the
ElevenLabs agent's `first_message` is also set to the same line.** The build
spec asks for both: `/api/voice/incoming` must "play a consent/AI disclosure
line... then hand off", and separately the ElevenLabs agent's first message
must carry the disclosure. Doing both means the disclosure is guaranteed to
play even if the ElevenLabs handoff fails and falls back to a plain
`<Say>`/`<Record>`, at the cost of a caller who reaches a working agent
hearing it stated twice in quick succession.
