# Runbook: installing a new client

This is the per-client checklist. Steps marked **(CLI)** are one command.
Steps marked **(manual)** need a browser or a phone and cannot be
automated - do them in order, they depend on each other.

## 1. Scaffold the client

**(CLI)**

```powershell
npm run frontdesk -- init --client <client-id>
```

Edit `clients/<client-id>/config.json`: business name, hours, services,
service area, prices policy, FAQ, emergency rules, owner notification email.
See `clients/_template/README.md` for what each field means.

## 2. Create the Vercel project (first client only sets this up; later clients reuse the pattern)

**(manual, one time per client - a new Vercel project per client, not per repo)**

From the repo root (not `apps/web` - see docs/DESIGN_NOTES.md):

```powershell
vercel link
```

Answer the prompts: create a new project, and when asked for the project's
root directory, enter `apps/web`. Note the project name.

## 3. Set the deployment's env vars

**(manual, one time)** Set `CLIENT_ID` to `<client-id>` and every other
required var from `docs/ENV_CONTRACT.md` on the Vercel project (dashboard,
or `vercel env add <NAME> production`). `frontdesk provision` (next step)
does this for you for anything already in your local `.env.local`.

## 4. Provision

**(CLI)**

```powershell
npm run frontdesk -- provision --client <client-id> --url https://<the-vercel-url>
```

Prints each step (Supabase migrations + tenant row, Vercel env vars, Worker
deploys, Twilio number config, ElevenLabs agent config) before doing it, and
tells you which were skipped and why. Safe to re-run - it only changes what
is not already correct.

**ElevenLabs agent security settings (done automatically by this step, dashboard
steps here for reference or manual troubleshooting):**

1. Open the agent in the ElevenLabs dashboard and go to its **Security** tab.
2. Turn on **Enable authentication** (this is `platform_settings.auth.enable_auth`
   via the API) so the agent only accepts a signed session, not a public agent id.
3. Under **Allowlist**, add the deployment's hostname (for example
   `frontdesk-kit-rho.vercel.app`) - this is an exact hostname match, so add
   subdomains separately if you use any.
4. Go to the **Advanced** tab, find **Call limits**, and set **Max conversation
   duration** to 120 seconds (2 minutes) - this is
   `conversation_config.conversation.max_duration_seconds` via the API, range
   60-7200, default 600.

`frontdesk verify` gate 6 reads all three settings back and fails if they don't
match the deployment.

## 5. Set up the client's own Twilio account

**(manual)** This project does not and cannot provision a Twilio account for
the client - only they can create one. Once they have:

1. Buy or port a phone number.
2. Set the number's Voice URL, Voice Method, Status Callback, and Status
   Callback Method - `frontdesk provision` does this via the API once you
   have `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
   `TWILIO_PHONE_NUMBER_SID` for that client's account.
3. Follow `docs/FALLBACK_TWIML.md` to create the fallback TwiML Bin and set
   `TWILIO_FALLBACK_TWIML_URL`.
4. Re-run step 4 (`frontdesk provision`) now that Twilio credentials exist -
   it will pick up and complete the previously-skipped Twilio step.

## 6. Deploy

**(CLI, from the repo root)**

```powershell
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

(`deploy.yml` does this automatically on push to `main`, once the
`VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` GitHub secrets are set for
this repo - see the README's "what you still have to do by hand" list. A
brand-new client that needs its *own* separate Vercel project needs its own
repo or its own CI job; this repo's `deploy.yml` deploys the one project it
is linked to.)

## 7. Verify

**(CLI)**

```powershell
npm run frontdesk -- verify --client <client-id> --url https://<the-vercel-url>
```

Every gate must be PASS or a clearly-explained SKIPPED. Any FAIL blocks
going live. The report is written to `reports/<client-id>-<date>.md` and to
the `install_checks` table (visible on the client's dashboard).

## 8. Live call test

**(manual - needs a real phone and the client's real Twilio number)**

Call the number. Confirm:

- You hear the AI disclosure line within a couple of seconds.
- The agent picks up the conversation and can answer a question from the
  client's own FAQ correctly.
- Asking something outside the FAQ (a specific price, a booking) gets a
  "let me take a message" response, not an invented answer.
- Hang up mid-call and check the dashboard - the call log should show the
  call and its final status, not "in-progress" forever.

This is the one thing in this project that is genuinely untested by
anything automated - see README, "What's actually been run, and what hasn't".

Before a Twilio account exists, the same agent can be tested in a browser on
the client's site ("Talk to the receptionist"). It is the same agent
configuration, so it is a reasonable stand-in for the content of the
conversation, but it does not exercise the phone webhook, signature
checking, or the Twilio-specific handoff, so it is not a substitute for this
step once a phone number is live.

## 9. Client walkthrough checklist

**(manual, with the client)**

- [ ] Show them the dashboard: leads, chat sessions, call logs, latest
      install report.
- [ ] Confirm their owner notification email is correct and they've received
      a test alert.
- [ ] Walk through what the assistant will and will not answer (prices,
      bookings) so they aren't surprised by a "let me take a message"
      response.
- [ ] Explain the emergency keyword list and confirm it matches how they
      actually want urgent calls handled.
- [ ] Give them this runbook's section 10 (monthly checks) so they know what
      "healthy" looks like going forward.

## 10. Monthly support checks

**(CLI, recurring)**

```powershell
npm run frontdesk -- doctor --client <client-id> --url https://<the-vercel-url>
```

Flags drift: a Twilio webhook pointing at an old URL, a missing required
Vercel env var, a Resend domain that's stopped verifying, or an ElevenLabs
agent setting that's changed outside of `frontdesk provision`. Zero findings
means nothing to do. Any finding should be fixed (usually by re-running
`frontdesk provision`) before it causes a real missed call or lost lead.
