# Fallback TwiML Bin

Twilio calls a phone number's **Fallback URL** only when the primary
**Voice URL** (`/api/voice/incoming`) fails to answer at all - a timeout, a
5xx, our deployment being down. It has to work even when our whole app is
unreachable, so it cannot be one of our own routes. Twilio's own TwiML Bins
(a small piece of static TwiML Twilio hosts and serves itself) are the right
tool for this.

This has to be created by hand in the Twilio console - there is no
documented API-first path for TwiML Bins that fits this project, and this
step needs a real Twilio account, which this project does not have (see
README, "no Twilio account").

## Steps (manual, in the Twilio console)

1. Console -> Runtime -> TwiML Bins -> Create new TwiML Bin.
2. Name it something like `<client-id>-fallback`.
3. Body:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, our system is temporarily unavailable. Connecting you to the office now.</Say>
  <Dial>{{OWNER_FALLBACK_PHONE}}</Dial>
</Response>
```

Replace `{{OWNER_FALLBACK_PHONE}}` with the real number (the same value as
the `OWNER_FALLBACK_PHONE` env var for that client - TwiML Bins do not read
environment variables, so this has to be the literal number).

4. Save, and copy the Bin's URL (looks like
   `https://handler.twilio.com/twiml/EHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`).
5. Set that URL as `TWILIO_FALLBACK_TWIML_URL` for the client (in
   `.env.local` locally, or `vercel env add TWILIO_FALLBACK_TWIML_URL
   production` for the deployment) before running `frontdesk provision`.
   `frontdesk provision` sets it as the phone number's Fallback URL; it never
   creates or edits the Bin itself.

## Why a `<Dial>`, not a `<Record>`

If the office line also doesn't answer, `<Dial>` alone hangs up after ringing
out. That's an acceptable worst case for a fallback-of-a-fallback: better an
honest missed call than a bin that promises "someone will call you back" and
silently doesn't route anywhere, which is the exact "resolution illusion"
failure mode RESEARCH.md section 1.5 describes.
