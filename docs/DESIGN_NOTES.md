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

## Gate 11 tested provider uptime, not auth

`frontdesk verify` gate 11 required a with-secret request to `llm-gateway`
to return exactly 200, which conflated two different things: whether the
shared secret is accepted, and whether the LLM provider behind it happens
to be up. A real Gemini free-tier quota blip turned a correct auth check
into a false FAIL. Fixed to only require "not 401" for the with-secret
case - 401 means the secret was rejected (a real auth failure), anything
else means the secret was accepted and the request reached the provider
call, whatever happened after that is a provider-availability question the
gate was never meant to answer.

## A custom .vercel.app alias does not follow new deployments

After renaming the Vercel project, I claimed a clean alias
(`ai-receptionist-installer.vercel.app`) with `vercel alias set`. Vercel's
own auto-managed production alias (the long team-suffixed one) repoints
itself to the newest deployment on every `vercel deploy --prod`
automatically. A manually created alias does not - it stays pinned to
whatever deployment it was pointed at until you run `vercel alias set`
again. This meant several redeploys in a row silently kept serving stale
code on the canonical URL while `vercel deploy` itself reported success,
which is exactly how the two bugs below stayed "fixed" in git but broken in
production for a while. The fix going forward: every `vercel deploy --prod`
in this project must be followed by `vercel alias set <new-deployment-url>
ai-receptionist-installer.vercel.app`, and `frontdesk verify`'s gate 1
(build) plus a live gate against the canonical URL is exactly the kind of
check that should catch a stale alias before it's mistaken for a working
fix - which is what actually caught this.

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

## Round 3: reviewer feedback - demo clarity and voice noise handling

A reviewer testing the live demo said two things: it wasn't clear what the
tool actually does versus the fake plumbing site, and the browser voice
agent answered phantom phrases like "good morning" when nobody had said
anything - the demo's office background noise was getting transcribed and
answered as if it were real speech.

**Demo clarity: a banner and an about page, not a rewritten homepage.** The
homepage is deliberately still the fake client's site (that's the point of
the demo), so the fix is a slim banner on every page linking to
`/about-this-demo`, plus rewriting the README's opening framing so a reader
understands the product within 10 seconds, not just visitors to the live
site. See `apps/web/app/components/DemoBanner.tsx`,
`apps/web/app/about-this-demo/page.tsx`, and the top of `README.md`.

**Turn timeout: 10 seconds, from ElevenLabs' own conversation-flow guidance,
not a guess.** The conversation flow docs
(`docs/eleven-agents/customization/conversation-flow`) give `turn_timeout`
a documented range of 1-30 seconds, with "5-10 seconds for casual
conversations where quick back-and-forth is expected" and "10-30 seconds
when users may need more time to think." 10 seconds sits at the top of the
casual-conversation band and the bottom of the longer band - long enough
that a brief noise blip during silence is less likely to be treated as a
completed turn, without making a caller who really has finished talking
wait noticeably long for a reply. Combined with `turn_eagerness: "patient"`
(the docs recommend "patient" specifically for letting a caller take more
time, versus "eager" for rapid customer-service replies), the agent waits
longer before deciding the caller is done, which is the main lever available
against noise being mistaken for a finished turn. See
`packages/cli/src/lib/elevenLabsProvision.ts`.

**Audio environment does not help with input noise, and we say so instead of
pretending it does.** That docs page
(`docs/eleven-agents/customization/voice/audio-environment`) is entirely
about the agent's *outbound* audio: `background_sound` loops ambient sound
under the agent's own speech, and `voice_filter` reshapes the agent's
generated voice. The docs state background sound "is not sent into speech
recognition" - it cannot affect what the agent hears from a caller in a
noisy room, only what the caller hears from the agent. There is no
documented ElevenLabs setting for suppressing noise in incoming caller
audio, so this layer contributes nothing to the noise problem and is left
alone (it was already off, and stays off).

**Neither the embed widget nor the React SDK accepts custom microphone
constraints.** The ask was to request the mic with
`echoCancellation`/`noiseSuppression`/`autoGainControl` if either surface
allowed it. Neither `<elevenlabs-convai>` nor `@elevenlabs/react`'s
`useConversation` exposes a `getUserMedia` constraints option in their
current docs or public API - both open the microphone internally. The
switch from the embed widget to the SDK happened anyway, because the SDK
still exposes things the widget doesn't: conversation `status`
(listening/speaking), `isMuted`/`setMuted()`, and `sendUserMessage()` for a
text fallback. Browser-side noise handling is therefore limited to whatever
noise suppression the OS/browser applies by default to any `getUserMedia`
call, plus the mute button and text input as user-controlled workarounds.
See `apps/web/app/components/VoiceWidget.tsx`.

**skip_turn and a fragmentary-input instruction do the rest of the work.**
The agent's `built_in_tools.skip_turn` system tool (documented as an
option under `conversation_config.agent.prompt.built_in_tools`) lets the
agent decline to respond to a turn instead of being forced to say
something. The system prompt tells it explicitly when to use that tool:
fragmentary, off-topic, or non-caller-sounding input should be skipped, not
answered, and two skips in a row get one short "Sorry, I didn't catch that"
line instead of silence forever. This is the layer that actually stops a
transcribed noise blip from producing a made-up answer - the timing and
audio settings above only reduce how often noise gets transcribed as a
turn in the first place. See `VOICE_NOISE_INSTRUCTIONS` in
`packages/cli/src/lib/elevenLabsProvision.ts`.

**`@elevenlabs/react`'s `useConversation` requires a `ConversationProvider`
ancestor, which broke the production build, not just local dev.** The docs
state "all conversation hooks must be used within a ConversationProvider,"
but the first VoiceWidget rewrite called `useConversation` directly. This
passed local typecheck and lint (a type-only problem, not what either
checks) and only failed at `next build`'s static prerender step of `/`,
which is also exactly what Vercel's build runs on every deploy - so it
reached CI green and still broke the live deploy. Fixed by wrapping the
hook-using component in `<ConversationProvider>` inside `VoiceWidget.tsx`.
This is now the standing reason `npm run build -w apps/web` gets run
locally before pushing frontend changes, not just typecheck/lint/test.

**The ElevenLabs agent-testing "run-tests" response is documented as
starting a run, but not how to read its result.** The docs describe
`POST /v1/convai/agent-testing/create` and
`.../agents/{agent_id}/run-tests` in enough detail to start a test, but the
run-tests response only ever comes back with each test's status as
"pending" - the docs pages available don't describe how to retrieve the
resolved result. Found by probing the live API with the run-tests
response's own `id` field: `GET /v1/convai/test-invocations/{id}` returns
200 with the same test_runs array, polled until each entry's status is no
longer "pending," at which point `condition_result.result` and
`agent_responses` hold the actual verdict and what the agent said. See
`scripts/voice-noise-test.ts` and `getTestInvocation()` in
`packages/config/src/elevenLabsClient.ts`.

## Gate 3 can be starved by the same daily chat quota gate 12 spends

Re-running `frontdesk verify` live several times in one round (each run's
own gate 12 deliberately sends 11 chat messages to trip the per-IP limit)
spent the shared daily budget (`CHAT_RATE_LIMIT_DAILY=15`, kept low to stay
under Gemini's free-tier ceiling - see the Gemini section above) partway
through this round's testing. Once that budget is gone, `/api/chat/message`
returns 429 for every request regardless of consent, including gate 3's
first without-consent request, which expects 403. The route can't
distinguish "quota exhausted" from "rate limited" before it ever reaches
consent logic, so gate 3 reads as a FAIL that looks like a broken consent
gate but is actually a shared-budget collision from testing volume, not a
functional regression - every other gate, including the new gate 6 checks
this round added, still passed live. Left unfixed rather than special-cased
like gate 11 was: unlike gate 11, gate 3 genuinely needs to send a real
without-consent request to prove 403 happens before any answer, so there's
no equivalent "don't require the exact status" fix available without
weakening what the gate actually proves. The honest fix is a clean run
after the daily window resets, or a per-install `CHAT_RATE_LIMIT_DAILY`
high enough to survive a verify run's own gate 12, which isn't this
deployment's free-tier-constrained setup.

**Round 4 note:** this was fixed properly instead - see "VERIFY_TOKEN keeps
verify traffic off the public quota" and "Gemini's real free-tier daily
limit" below. Kept the paragraph above rather than rewriting it, since it
correctly explains why the problem existed in the first place.

## VERIFY_TOKEN keeps verify traffic off the public quota

A round 3 reviewer's fix request revealed the actual design gap behind the
gate 3/12 problem above: `frontdesk verify` was indistinguishable from a
real visitor to `/api/chat/message`, so every verify run competed with real
traffic for the same public daily Gemini budget, and gate 12 specifically
was blasting a real visitor-shaped burst at the real per-IP limit from
whatever IP happened to run verify.

Fixed with a server-only `VERIFY_TOKEN` (random, min 16 characters, never
committed - same pattern as `LLM_GATEWAY_SHARED_SECRET`). A request to
`/api/chat/message` carrying a valid `x-verify-token` header:

- Gets answered by the mock provider (`forceMock: true` passed through to
  `workers/llm-gateway`, which honors it ahead of its own `LLM_PROVIDER`
  setting - see `packages/config/src/llmGateway.ts`), so it never calls
  Gemini or spends the public daily quota at all.
- Uses a separate rate-limit namespace (`chat_ip_verify` /
  `chat_daily_verify`, own small defaults, `VERIFY_RATE_LIMIT_PER_IP=5` /
  `VERIFY_RATE_LIMIT_DAILY=50`) instead of the public `chat_ip` /
  `chat_daily` scopes, so verify's own testing volume can never trip or
  starve the public limits either.
- Skips the lead-capture + owner-notification side effect entirely (an
  ungrounded mock reply to a scripted "hi" is not a real lead, and the
  business owner should not get a real email alert every time someone runs
  `frontdesk verify`).

Gate 12 is the one exception that still needs to touch the *real* public
`chat_ip` scope, because that is specifically what it is proving works. It
sends both `x-verify-token` and a second header,
`x-verify-rate-limit-key`, set to a fresh random value per run
(`gate12-<uuid>`). The route only honors the second header when the first
is already valid (see `apps/web/app/api/chat/message/route.ts`), so a
public caller can never spoof it to dodge their own per-IP limit - only
someone who already holds `VERIFY_TOKEN` can pick their own rate-limit
key. This lets gate 12 exercise the exact same scope, limit, and window a
real visitor would hit, proving the public limit still trips at 429,
without ever sharing a bucket with a real visitor's IP or spending the
shared daily budget to do it. Gates 3 and 12 both fall back to their old,
public-quota-spending behavior if `VERIFY_TOKEN` isn't set at all, so this
is additive, not a hard requirement for `frontdesk verify` to run.

## Gemini's real free-tier daily limit

`ai.google.dev/gemini-api/docs/rate-limits` no longer publishes a static
per-model numeric table - it now says limits "can be viewed in Google AI
Studio" and links to a signed-in dashboard. Checked the pricing and models
pages too; neither lists a free-tier RPD number for `gemini-3.6-flash`
either.

The authoritative number turned out to be sitting in Gemini's own quota
error response. Calling the real `generateContent` endpoint directly
(bypassing this project entirely) until it returned 429 gave:

```
"Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests,
limit: 20, model: gemini-3.6-flash"
```

with a structured `QuotaFailure` violation: `quotaId:
"GenerateRequestsPerDayPerProjectPerModel-FreeTier"`, `quotaValue: "20"`.
This confirms round 2's empirically-observed "20 requests per day" figure
was exactly right, from Google's own quota system for this project's real
key, not a guess.

`CHAT_RATE_LIMIT_DAILY` raised from 15 to **18** - safely under the real
ceiling of 20, with a 2-request margin held back for: the fixed-window
reset boundary not being guaranteed to align exactly with Google's own
quota reset, and any direct testing against the real Gemini API (like the
probe above) that doesn't go through this app's own counter at all. Now
that `VERIFY_TOKEN` (above) takes all of `frontdesk verify`'s own chat
traffic off this budget entirely, the full 18 is available to real
visitors - unlike round 3, where verify itself was one of the things
competing for it.

## Round 5: getting npm run demo to actually run, not just typecheck

`scripts/demo.ts` typechecked and looked correct on the first pass, but
three real bugs only surfaced by actually running it end to end (Windows,
Docker Desktop, local Supabase - none of which a type checker can see):

**`execFileSync`/`spawn` with `"npx"`/`"npm"` fails differently depending on
how you try to fix it, on Windows.** Calling them by bare name without a
shell fails with `ENOENT` (Windows can't directly exec a `.cmd` shim). The
"obvious" fix - call `"npx.cmd"` directly instead - fails a different way,
`EINVAL`, because a `.cmd` file still needs the shell to interpret it; Node
can locate it but not execute it standalone. The actual fix is `shell:
true`, kept only for `npx`/`npm` invocations (not `docker`, which is a real
`.exe` and doesn't need it) - Node warns this is unsafe with an args array
(unescaped concatenation), which is a real concern with untrusted input,
but not here: every argument passed this way is a literal string this
script controls, never anything from a request or a file.

**A required env var is not safe to blank out.** The first working version
set `SUPABASE_PROJECT_REF` to `""` for demo mode, since the CLI is the only
thing that reads it. But `packages/config/src/env.ts` requires it
(`z.string().min(1)`) for the whole app, not just the CLI's use of it, so
the Next.js server crashed at startup with an env validation error the
instant demo mode's env diverged from a real `.env.local`. Fixed with a
placeholder value (`"local-demo"`) instead of blanking it - satisfies the
schema, still obviously fake, still never touches a real Supabase project.

**Deleting an env var is not the same as setting it to `""`, and which one
is correct depends on the specific variable.** Demo mode needs
ELEVENLABS/TWILIO/RESEND to be off regardless of what a real `.env.local`
on the same machine contains. `apps/web/scripts/with-root-env.ts`'s
`process.loadEnvFile()` never overrides a variable that is already set -
including set to `""` - but it does fill in one that is genuinely absent.
So the fix has to be "set to `""`", not "delete", for that guarantee to
hold - confirmed by first trying delete, which let a real `.env.local`
silently turn voice back on in demo mode, defeating the entire point.
`MEDIA_GATE_URL`/`MEDIA_GATE_SIGNING_SECRET` can't take the same fix
though: they have their own format validators (`.url()`, `.min(16)`) that
reject an empty string even though the field itself is optional, so they
have to be deleted, which reopens the same gap for those two specifically.
Accepted rather than solved further - media-gate has no UI wired to it yet
(see the README), so this cannot change anything a demo mode user actually
sees or does.

**Resolved - could not reproduce.** A prior session recorded chat replies in
demo mode taking 15-20 seconds even against the mock provider, and left it
open as unexplained. Re-tested directly against a freshly started `npm run
demo` stack, three independent ways: `curl` straight to the `llm-gateway`
worker (`~18ms`), `curl` straight to `/api/chat/message` on the Next.js dev
server with a real consent/session (five runs, `135ms`-`311ms`, including a
cold first hit), and the real chat widget in an actual browser, read back
via `performance.getEntriesByType('resource')` rather than eyeballed
(`299.5ms`, then `381.1ms` on a second message). All three came back well
under half a second, every time. The most likely explanation is that the
original 15-20s figure was measured by watching wall-clock time across
several manual/tool-driven steps rather than isolating the network request
itself - exactly the mistake a first pass at re-measuring it here almost
repeated, before switching to the browser's own resource-timing entries.
Not ruling out that the prior session's Docker/WSL2 state (see below) was
briefly degraded in a way `docker info` didn't surface, but there's nothing
left to fix in the code - `runMockProvider` and the request path both
measure fast now.

**Also found: local Docker Desktop can end up in a state where `docker
info` succeeds but every container operation returns a 500 from the
daemon API.** A full Docker Desktop process kill-and-relaunch did not fix
it; `wsl --shutdown` (Docker Desktop's Linux backend runs under WSL2) plus
a relaunch did. Unrelated to this project's code, but worth knowing if
`npm run demo` mysteriously can't reach Docker at all even though `docker
info` looks fine.
