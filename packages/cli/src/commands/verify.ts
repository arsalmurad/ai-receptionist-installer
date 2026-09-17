import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  computeTwilioSignature,
  TWILIO_SIGNATURE_HEADER,
  getAgent,
  getDomainStatusByName,
  getIncomingPhoneNumber,
  signMediaPath,
  LLM_GATEWAY_SECRET_HEADER,
} from "@frontdesk-kit/config";
import { readClientConfig } from "../lib/clientConfig";
import { env } from "../lib/env";
import { run } from "../lib/exec";
import { REPO_ROOT } from "../lib/paths";
import { getSupabaseAdmin } from "../lib/supabase";
import { buildDesiredAgentState, agentMatchesDesired } from "../lib/elevenLabsProvision";
import { buildDesiredUrls, needsTwilioUpdate } from "../lib/twilioProvision";
import { scanForSecrets } from "../lib/secretScan";
import { runGate, Skip, Fail } from "../lib/gate";
import { printGateTable, writeMarkdownReport, overallStatus, type GateResult } from "../lib/report";

interface VerifyOptions {
  url?: string;
  json?: boolean;
}

const SECRET_VAR_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_PASSWORD",
  "LLM_API_KEY",
  "LLM_GATEWAY_SHARED_SECRET",
  "MEDIA_GATE_SIGNING_SECRET",
  "RESEND_API_KEY",
  "ELEVENLABS_API_KEY",
  "TWILIO_AUTH_TOKEN",
  "CLOUDFLARE_API_TOKEN",
];

export async function verifyCommand(clientId: string, options: VerifyOptions): Promise<void> {
  const config = readClientConfig(clientId);
  const url = options.url?.replace(/\/$/, "");
  const webDir = resolve(REPO_ROOT, "apps/web");
  process.env.CLIENT_ID = clientId;

  const results: GateResult[] = [];

  // Gate 1: typecheck and build clean
  results.push(
    await runGate("1 typecheck+build", async () => {
      const typecheck = run("npm", ["run", "typecheck"]);
      if (typecheck.status !== 0) {
        throw new Fail(`typecheck failed: ${typecheck.stdout.slice(-500)}`);
      }
      const build = run("npm", ["run", "build", "-w", "apps/web"]);
      if (build.status !== 0) {
        throw new Fail(`build failed: ${build.stdout.slice(-500)}`);
      }
      return "typecheck and build both exited 0";
    }),
  );

  // Gate 2: key pages return 200
  results.push(
    await runGate("2 pages 200", async () => {
      if (!url) throw new Skip("no --url given");
      const paths = ["/", "/dashboard/login"];
      for (const path of paths) {
        const res = await fetch(`${url}${path}`);
        if (res.status !== 200) throw new Fail(`${path} returned ${res.status}`);
      }
      return `${paths.join(", ")} all returned 200`;
    }),
  );

  // Gate 3: consent gate
  results.push(
    await runGate("3 consent gate", async () => {
      if (!url) throw new Skip("no --url given");

      const withoutConsent = await fetch(`${url}/api/chat/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentId: "00000000-0000-0000-0000-000000000000", sessionId: "00000000-0000-0000-0000-000000000000", message: "hi" }),
      });
      if (withoutConsent.status !== 403) throw new Fail(`expected 403 without consent, got ${withoutConsent.status}`);

      const consentRes = await fetch(`${url}/api/chat/consent`, { method: "POST" });
      if (consentRes.status !== 200) throw new Fail(`consent endpoint returned ${consentRes.status}`);
      const { consentId, sessionId } = (await consentRes.json()) as { consentId: string; sessionId: string };

      const withConsent = await fetch(`${url}/api/chat/message`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consentId, sessionId, message: "Do you offer free estimates?" }),
      });
      if (withConsent.status !== 200) throw new Fail(`expected 200 with consent, got ${withConsent.status}`);
      return "403 without consent, 200 with consent";
    }),
  );

  // Gate 4: voice route signature verification, no Twilio account required
  results.push(
    await runGate("4 voice signature", async () => {
      if (!url) throw new Skip("no --url given");
      const authToken = env("TWILIO_AUTH_TOKEN");
      if (!authToken) throw new Skip("no TWILIO_AUTH_TOKEN set locally");

      const target = `${url}/api/voice/incoming`;
      const params: Record<string, string> = {
        CallSid: `CA${"0".repeat(32)}`,
        From: "+15550001111",
        To: "+15550002222",
        CallStatus: "ringing",
      };
      const body = new URLSearchParams(params).toString();
      const validSignature = await computeTwilioSignature(authToken, target, params);

      const unsigned = await fetch(target, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
      if (unsigned.status !== 403) throw new Fail(`unsigned request expected 403, got ${unsigned.status}`);

      const tampered = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", [TWILIO_SIGNATURE_HEADER]: `${validSignature}tampered` },
        body,
      });
      if (tampered.status !== 403) throw new Fail(`tampered signature expected 403, got ${tampered.status}`);

      const valid = await fetch(target, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", [TWILIO_SIGNATURE_HEADER]: validSignature },
        body,
      });
      if (valid.status !== 200) throw new Fail(`validly-signed request expected 200, got ${valid.status}`);

      return "valid signature accepted, unsigned and tampered both rejected with 403";
    }),
  );

  // Gate 5: Twilio number config readback
  results.push(
    await runGate("5 twilio number", async () => {
      const accountSid = env("TWILIO_ACCOUNT_SID");
      if (!accountSid) throw new Skip("no TWILIO_ACCOUNT_SID - this install has no Twilio account. The route itself is covered by gate 4 and scripts/simulate-call.ts.");
      const authToken = env("TWILIO_AUTH_TOKEN");
      const phoneNumberSid = env("TWILIO_PHONE_NUMBER_SID");
      const fallbackTwimlUrl = env("TWILIO_FALLBACK_TWIML_URL");
      if (!authToken || !phoneNumberSid || !fallbackTwimlUrl || !url) {
        throw new Skip("TWILIO_ACCOUNT_SID set but TWILIO_AUTH_TOKEN/TWILIO_PHONE_NUMBER_SID/TWILIO_FALLBACK_TWIML_URL/--url missing");
      }
      const current = await getIncomingPhoneNumber(accountSid, authToken, phoneNumberSid);
      const desired = buildDesiredUrls(url, fallbackTwimlUrl);
      if (needsTwilioUpdate(current, desired)) {
        throw new Fail(`voice URL or fallback URL does not match. current=${current.voice_url} / ${current.voice_fallback_url}`);
      }
      return "voice URL and fallback URL match";
    }),
  );

  // Gate 6: ElevenLabs privacy, auth, and max-duration readback
  results.push(
    await runGate("6 elevenlabs privacy", async () => {
      const apiKey = env("ELEVENLABS_API_KEY");
      const agentId = env("ELEVENLABS_AGENT_ID");
      if (!apiKey || !agentId) throw new Skip("no ELEVENLABS_API_KEY/ELEVENLABS_AGENT_ID set");
      const agent = await getAgent(apiKey, agentId);
      const siteHostname = url ? new URL(url).hostname : undefined;
      const desired = buildDesiredAgentState(config, siteHostname);
      if (!agentMatchesDesired(agent, desired)) {
        throw new Fail("agent first_message/prompt/audio-saving/auth/allowlist/max-duration do not match config. Run frontdesk provision first.");
      }
      return "first message, system prompt, audio saving, auth required, domain allowlist, and max duration all match";
    }),
  );

  // Gate 7: Resend domain verified
  results.push(
    await runGate("7 resend domain", async () => {
      const apiKey = env("RESEND_API_KEY");
      const domain = env("RESEND_FROM_DOMAIN");
      if (!apiKey || !domain) throw new Skip("no RESEND_API_KEY/RESEND_FROM_DOMAIN set");
      const record = await getDomainStatusByName(apiKey, domain);
      if (!record) throw new Fail(`domain ${domain} not found in this Resend account`);
      if (record.status !== "verified") throw new Fail(`domain status is "${record.status}", not verified`);
      return `${domain} is verified`;
    }),
  );

  // Gate 8: secrets never reach the client bundle
  results.push(
    await runGate("8 secrets server-only", async () => {
      const staticDir = resolve(webDir, ".next/static");
      if (!existsSync(staticDir)) throw new Fail(".next/static missing - gate 1 must build first");
      const values = SECRET_VAR_NAMES.map((name) => env(name)).filter((v): v is string => Boolean(v));
      const findings = scanForSecrets(staticDir, SECRET_VAR_NAMES, values);
      if (findings.length > 0) {
        const summary = findings.slice(0, 5).map((f) => `${f.matched} in ${f.file}`).join("; ");
        throw new Fail(`found in client bundle: ${summary}`);
      }
      return `scanned .next/static, no server-only names or values found`;
    }),
  );

  // Gate 9: RLS cross-tenant isolation
  results.push(await runGate("9 RLS isolation", () => checkRlsIsolation()));

  // Gate 10: media-gate signature/expiry
  results.push(
    await runGate("10 media-gate", async () => {
      const gateUrl = env("MEDIA_GATE_URL");
      const secret = env("MEDIA_GATE_SIGNING_SECRET");
      if (!gateUrl || !secret) throw new Skip("no MEDIA_GATE_URL/MEDIA_GATE_SIGNING_SECRET set");

      const path = "/verify-check/sample.txt";
      const now = Math.floor(Date.now() / 1000);

      const unsigned = await fetch(`${gateUrl}${path}`);
      if (unsigned.status !== 403) throw new Fail(`unsigned request expected 403, got ${unsigned.status}`);

      const expiredSig = await signMediaPath(secret, path, now - 60);
      const expired = await fetch(`${gateUrl}${path}?exp=${now - 60}&sig=${expiredSig}`);
      if (expired.status !== 403) throw new Fail(`expired request expected 403, got ${expired.status}`);

      const validSig = await signMediaPath(secret, path, now + 300);
      const valid = await fetch(`${gateUrl}${path}?exp=${now + 300}&sig=${validSig}`);
      if (valid.status !== 200) throw new Fail(`validly-signed request expected 200, got ${valid.status}`);

      return "unsigned and expired both rejected, valid signature accepted";
    }),
  );

  // Gate 11: llm-gateway shared secret
  results.push(
    await runGate("11 llm-gateway auth", async () => {
      const gatewayUrl = env("LLM_GATEWAY_URL");
      const secret = env("LLM_GATEWAY_SHARED_SECRET");
      if (!gatewayUrl || !secret) throw new Skip("no LLM_GATEWAY_URL/LLM_GATEWAY_SHARED_SECRET set");

      const payload = { systemPrompt: "test", userMessage: "hello", history: [], faq: [] };
      const withoutSecret = await fetch(`${gatewayUrl}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (withoutSecret.status !== 401) throw new Fail(`no-secret request expected 401, got ${withoutSecret.status}`);

      const withSecret = await fetch(`${gatewayUrl}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", [LLM_GATEWAY_SECRET_HEADER]: secret },
        body: JSON.stringify(payload),
      });
      // This gate is about the auth check, not the LLM provider's own
      // uptime - a correct secret must never come back 401. 502 means the
      // secret was accepted and the request reached the provider call,
      // which then failed on its own (e.g. a free-tier quota); that is a
      // real but separate problem, not an auth failure.
      if (withSecret.status === 401) throw new Fail(`with-secret request was rejected with 401 - the shared secret is not being accepted`);

      return `401 without shared secret, ${withSecret.status} with it (not 401, so the secret was accepted)`;
    }),
  );

  // Gate 12: rate limits
  results.push(
    await runGate("12 rate limits", async () => {
      if (!url) throw new Skip("no --url given");
      const limit = Number(env("CHAT_RATE_LIMIT_PER_IP") ?? 10);

      const consentRes = await fetch(`${url}/api/chat/consent`, { method: "POST" });
      if (consentRes.status !== 200) throw new Fail(`consent endpoint returned ${consentRes.status}`);
      const { consentId, sessionId } = (await consentRes.json()) as { consentId: string; sessionId: string };

      let lastStatus = 0;
      for (let i = 0; i < limit + 1; i++) {
        const res = await fetch(`${url}/api/chat/message`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ consentId, sessionId, message: "hi" }),
        });
        lastStatus = res.status;
        if (res.status === 429) break;
      }

      if (lastStatus !== 429) {
        throw new Fail(`sent ${limit + 1} messages from one client and never got 429 (CHAT_RATE_LIMIT_PER_IP=${limit})`);
      }
      return `got 429 within ${limit + 1} messages sent from one client (CHAT_RATE_LIMIT_PER_IP=${limit}); tests the real per-IP limit from a single client rather than a spoofable test-IP header, since Vercel already overwrites x-forwarded-for and does not forward external IPs`;
    }),
  );

  printGateTable(results);
  const status = overallStatus(results);
  const reportPath = writeMarkdownReport(clientId, results, url);
  console.log(`\nOverall: ${status.toUpperCase()}`);
  console.log(`Report written to ${reportPath}`);

  await recordInstallCheck(clientId, results, status, reportPath);

  if (options.json) {
    console.log(JSON.stringify({ clientId, url, status, results }, null, 2));
  }

  if (status === "fail") process.exitCode = 1;
}

async function checkRlsIsolation(): Promise<string> {
  const admin = getSupabaseAdmin();
  const anonUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!admin || !anonUrl || !anonKey) throw new Skip("no Supabase service role key / anon key set");

  const suffix = Date.now();
  const tenantAId = await insertTenant(admin, `rls-check-a-${suffix}`);
  const tenantBId = await insertTenant(admin, `rls-check-b-${suffix}`);

  const password = `Check-${suffix}-Aa1!`;
  const userAEmail = `rls-check-a-${suffix}@example.com`;

  try {
    const { data: userA, error: userAError } = await admin.auth.admin.createUser({
      email: userAEmail,
      password,
      email_confirm: true,
    });
    if (userAError || !userA.user) throw new Fail(`could not create test user: ${userAError?.message}`);

    await admin.from("tenant_members").insert({ tenant_id: tenantAId, user_id: userA.user.id, role: "owner" });
    await admin.from("leads").insert({ tenant_id: tenantBId, source: "chat", message: "tenant B only lead" });

    const anon = createClient(anonUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: signInError } = await anon.auth.signInWithPassword({ email: userAEmail, password });
    if (signInError) throw new Fail(`could not sign in as test user: ${signInError.message}`);

    const { data: leaked } = await anon.from("leads").select("id").eq("tenant_id", tenantBId);
    if (leaked && leaked.length > 0) {
      throw new Fail("tenant A user could read tenant B leads - RLS is not enforcing isolation");
    }

    await admin.auth.admin.deleteUser(userA.user.id);
    return "tenant A user could not read tenant B rows";
  } finally {
    await admin.from("tenants").delete().eq("id", tenantAId);
    await admin.from("tenants").delete().eq("id", tenantBId);
  }
}

async function insertTenant(admin: SupabaseClient, clientId: string): Promise<string> {
  const { data, error } = await admin.from("tenants").insert({ client_id: clientId, business_name: clientId }).select("id").single();
  if (error || !data) throw new Fail(`could not create throwaway tenant: ${error?.message}`);
  return data.id as string;
}

async function recordInstallCheck(clientId: string, results: GateResult[], status: "pass" | "fail", reportPath: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { data: tenant } = await admin.from("tenants").select("id").eq("client_id", clientId).maybeSingle();
  if (!tenant) return;
  await admin.from("install_checks").insert({
    tenant_id: tenant.id,
    overall_status: status,
    results,
    report_path: reportPath,
  });
}
