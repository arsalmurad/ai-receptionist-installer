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

## Gemini's free tier is the real binding limit, not our own rate limit

While taking screenshots, the chat route started returning 500s. The cause
was Gemini's free tier: `generativelanguage.googleapis.com` caps
`gemini-3.6-flash` at 20 requests per day per project on the free tier,
independent of anything this app controls. Our own `CHAT_RATE_LIMIT_DAILY`
default of 200 is meaningless if the vendor cuts the connection at 20 first,
and the failure mode was worse than a friendly cap - an unhandled 500, not
even the graceful "reached today's limit" message. Two fixes: `CHAT_RATE_LIMIT_DAILY`
is set to 15 on this deployment (comfortably under Gemini's real ceiling, so
our own message fires first), and the chat route now catches an
`llm-gateway` failure of any kind and degrades to the same fixed "let me
take your info" response used for a genuine out-of-scope question - a
backend outage must never be visible to a caller as silence, a raw error, or
(worse) an invented answer. A production deployment with a paid Gemini tier
or a different provider would not need the lowered cap; it exists here
specifically because this demo runs on the free tier.

## A real bug found while taking screenshots

The chat widget only special-cased a 403 response (expired consent). Any
other non-2xx response, including a 429 from the rate limiter, fell through
to `data.reply`, which is `undefined` on an error body, and rendered as a
blank assistant bubble instead of the friendly rate-limit message the API
actually sent back. Found by hitting the widget in a browser right after a
`frontdesk verify` run (gate 12 deliberately exhausts the per-IP chat limit
from whatever machine ran it) - exactly the kind of thing that only shows up
by actually using the UI, not by reading the API route in isolation. Fixed
in `apps/web/app/components/ChatWidget.tsx` to show `data.error` for any
non-ok response.

## A known local-only quirk

`scripts/simulate-call.ts`'s localhost leg signs requests against the
literal URL it POSTs to (`http://127.0.0.1:3000/...`), which matches
production exactly (both gate 4 and the deployed simulate-call leg pass
cleanly). Against a local `next dev` server, though, the signed request
comes back 403 - `request.url` inside the route handler does not always
match the literal host the client connected on in dev mode. This has not
been root-caused further since the deployed target is what actually matters
and is fully green; treat the deployed leg's result as authoritative and the
localhost leg as a convenience that may need `NEXT_PUBLIC_SITE_URL`-style
host alignment to work reliably in dev.

## Round 2: security fix, rate limits, browser voice

**The public test Twilio auth token was a real vulnerability, not just an
honesty note.** The README documented the exact literal string used for
`TWILIO_AUTH_TOKEN`. Since the voice webhook only checks that a request's
signature was computed with that token, publishing it meant anyone reading
the README could sign requests that pass verification, write real
`consents`/`call_logs` rows, and trigger a real owner email. Fixed by
generating a random 32-byte token, rotating it in `.env.local` and Vercel,
and removing the literal value from every doc - the README now says the
token is random and never shown, which is sufficient for a reader to trust
the mechanism without being able to reproduce it.

**`x-forwarded-for` is trustworthy on Vercel, so rate limiting doesn't need a
spoofable test header.** Vercel's own docs are explicit: "we currently
overwrite the X-Forwarded-For header and do not forward external IPs. This
restriction is in place to prevent IP spoofing." That means `frontdesk
verify`'s rate-limit gate can fire real requests from one real client and
rely on the real per-IP counter, rather than trusting a client-supplied
override header, which would just move the spoofing problem rather than
solve it.

**Rate limit counters live in Postgres, not in-memory.** Vercel Functions are
stateless per invocation, so an in-memory counter resets on every cold start
and isn't shared across instances. `rate_limits` plus a single
`increment_rate_limit(scope, key, window_start)` SQL function does an atomic
insert-or-increment in one statement, so concurrent requests from the same
key can't race past each other. The function is `security definer`,
`revoke`d from `public`, and `grant`ed only to `service_role`, so the anon
key (already exposed to the browser) cannot call it directly.

**Voice route rate limiting caps a leaked-key risk, but doesn't map to real
callers.** On a real Twilio call, `x-forwarded-for` on `/api/voice/*` would
be Twilio's own edge IP, not the caller's phone number - Twilio webhooks
don't originate from the caller. The per-IP limit there is still worth
having (it caps the blast radius if `TWILIO_AUTH_TOKEN` ever leaks again or
gets brute-forced), it just isn't a per-caller limit the way the chat one
is.

**ElevenLabs' primary documented Twilio integration doesn't cover browser
auth at all**, so the signed-URL flow came from a separate authentication
doc: `GET /v1/convai/conversation/get-signed-url` (header `xi-api-key`,
query param `agent_id`, response field `signed_url`), consumed by the
`<elevenlabs-convai signed-url="...">` widget attribute (the alternative to
`agent-id` for a private agent). Requiring auth, the domain allowlist, and
the max conversation duration are all set via the same agent PATCH endpoint
used for the phone path: `platform_settings.auth.enable_auth`,
`platform_settings.auth.allowlist` (array of `{hostname}`), and
`conversation_config.conversation.max_duration_seconds` (60-7200, default
600). `frontdesk provision` sets all three from the deployment's own site
URL and a fixed 120-second cap, and `frontdesk verify` gate 6 reads them
back.

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
