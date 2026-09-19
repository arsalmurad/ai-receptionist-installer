# Install report: demo-plumbing

Run at: 2026-09-19T03:12:20.729Z
Target URL: https://ai-receptionist-installer.vercel.app
Overall: PASS

| Gate | Status | Reason |
| --- | --- | --- |
| 1 typecheck+build | PASS | typecheck and build both exited 0 |
| 2 pages 200 | PASS | /, /dashboard/login all returned 200 |
| 3 consent gate | PASS | 403 without consent, 200 with consent |
| 4 voice signature | PASS | valid signature accepted, unsigned and tampered both rejected with 403 |
| 5 twilio number | SKIPPED | no TWILIO_ACCOUNT_SID - this install has no Twilio account. The route itself is covered by gate 4 and scripts/simulate-call.ts. |
| 6 elevenlabs privacy | PASS | first message, system prompt, audio saving, auth required, domain allowlist, max duration, turn eagerness, turn timeout, and skip_turn all match |
| 7 resend domain | PASS | notify.arsalmurad.com is verified |
| 8 secrets server-only | PASS | scanned .next/static, no server-only names or values found |
| 9 RLS isolation | PASS | tenant A user could not read tenant B rows |
| 10 media-gate | PASS | unsigned and expired both rejected, valid signature accepted |
| 11 llm-gateway auth | PASS | 401 without shared secret, 200 with it (not 401, so the secret was accepted) |
| 12 rate limits | PASS | got 429 within 11 messages sent under an isolated verify-only test key (CHAT_RATE_LIMIT_PER_IP=10); exercises the real public per-IP limit without touching any real visitor's window or the shared daily quota |
| 13 SEO basics | PASS | title and meta description present, canonical present, sitemap.xml and robots.txt reachable, JSON-LD parses with @type "LocalBusiness" (title differs between / and /about-this-demo) |
