# Install report: live-demo-plumbing

Run at: 2026-09-19T03:14:25.027Z
Target URL: https://ai-receptionist-installer.vercel.app
Overall: PASS

| Gate | Status | Reason |
| --- | --- | --- |
| 2 pages 200 | PASS | / all returned 200 |
| 3 consent gate | PASS | 403 without consent, 200 with consent |
| 4 voice signature | SKIPPED | no Twilio auth token given in target config |
| 5 twilio number | SKIPPED | target config is missing twilio.accountSid/authToken/phoneNumberSid/fallbackTwimlUrl |
| 6 elevenlabs privacy | SKIPPED | no elevenLabs credentials given in target config |
| 7 resend domain | SKIPPED | no resend credentials given in target config |
| 8 secrets server-only | SKIPPED | no secret names/values given in target config |
| 12 rate limits | PASS | got 429 within 11 messages sent under an isolated verify-only test key |
| 13 SEO basics | PASS | title and meta description present, canonical present, sitemap.xml and robots.txt reachable, JSON-LD parses with @type "LocalBusiness" (title differs between / and /about-this-demo) |
