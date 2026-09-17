# Install report: demo-plumbing

Run at: 2026-09-17T10:41:00.626Z
Target URL: https://ai-receptionist-installer.vercel.app
Overall: PASS

| Gate | Status | Reason |
| --- | --- | --- |
| 1 typecheck+build | PASS | typecheck and build both exited 0 |
| 2 pages 200 | PASS | /, /dashboard/login all returned 200 |
| 3 consent gate | PASS | 403 without consent, 200 with consent |
| 4 voice signature | PASS | valid signature accepted, unsigned and tampered both rejected with 403 |
| 5 twilio number | SKIPPED | no TWILIO_ACCOUNT_SID - this install has no Twilio account. The route itself is covered by gate 4 and scripts/simulate-call.ts. |
| 6 elevenlabs privacy | PASS | first message, system prompt, audio saving, auth required, domain allowlist, and max duration all match |
| 7 resend domain | PASS | notify.arsalmurad.com is verified |
| 8 secrets server-only | PASS | scanned .next/static, no server-only names or values found |
| 9 RLS isolation | PASS | tenant A user could not read tenant B rows |
| 10 media-gate | PASS | unsigned and expired both rejected, valid signature accepted |
| 11 llm-gateway auth | PASS | 401 without shared secret, 502 with it (not 401, so the secret was accepted) |
| 12 rate limits | PASS | got 429 within 11 messages sent from one client (CHAT_RATE_LIMIT_PER_IP=10); tests the real per-IP limit from a single client rather than a spoofable test-IP header, since Vercel already overwrites x-forwarded-for and does not forward external IPs |
