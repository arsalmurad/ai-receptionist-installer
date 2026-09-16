import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { computeTwilioSignature, TWILIO_SIGNATURE_HEADER } from "@frontdesk-kit/config";

/**
 * Sends Twilio-shaped, signed form POSTs at a running frontdesk-kit
 * deployment and checks the whole voice path end to end, without ever
 * calling the real Twilio API - see README "no Twilio account".
 *
 * Usage: npm run simulate-call -- --url https://your-deploy.vercel.app [--client demo-plumbing]
 * Also always tries http://localhost:3000 first, and skips it quietly if
 * nothing is listening there.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");

try {
  process.loadEnvFile(resolve(REPO_ROOT, ".env.local"));
} catch {
  // fine outside local dev
}

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const clientId = arg("client") ?? process.env.CLIENT_ID ?? "demo-plumbing";
const deployedUrl = arg("url") ?? process.env.NEXT_PUBLIC_SITE_URL;
const authToken = process.env.TWILIO_AUTH_TOKEN;

async function isReachable(url: string, timeoutMs = 1500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function simulateAgainst(baseUrl: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const check = (name: string, pass: boolean, detail: string) => results.push({ name, pass, detail });

  if (!authToken) {
    check("all checks", false, "TWILIO_AUTH_TOKEN not set locally - cannot sign requests");
    return results;
  }

  const target = `${baseUrl.replace(/\/$/, "")}/api/voice/incoming`;
  const statusTarget = `${baseUrl.replace(/\/$/, "")}/api/voice/status-callback`;
  const callSid = `CA${randomBytes(16).toString("hex")}`;
  const from = "+15550001111";
  const to = "+15550002222";
  const params: Record<string, string> = { CallSid: callSid, From: from, To: to, CallStatus: "ringing" };
  const body = new URLSearchParams(params).toString();
  const validSignature = await computeTwilioSignature(authToken, target, params);

  // 1. unsigned request rejected
  const unsigned = await fetch(target, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  check("unsigned request rejected", unsigned.status === 403, `status=${unsigned.status}`);

  // 2. tampered signature rejected
  const tampered = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", [TWILIO_SIGNATURE_HEADER]: `${validSignature}xx` },
    body,
  });
  check("tampered signature rejected", tampered.status === 403, `status=${tampered.status}`);

  // 3. valid signature accepted, returns TwiML with disclosure + handoff
  const valid = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", [TWILIO_SIGNATURE_HEADER]: validSignature },
    body,
  });
  const twiml = await valid.text();
  check("valid signature accepted (200)", valid.status === 200, `status=${valid.status}`);
  check("response is TwiML", /<Response>/.test(twiml), twiml.slice(0, 120));
  check("response contains the AI disclosure line", /recorded line/i.test(twiml), "looked for 'recorded line'");
  check(
    "response includes an agent handoff or fallback (Connect/Dial/Say/Record)",
    /<Connect>|<Dial>|<Record/.test(twiml),
    "looked for <Connect>, <Dial>, or <Record",
  );

  // 4. consent + call_log rows were written
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceKey) {
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: tenant } = await admin.from("tenants").select("id").eq("client_id", clientId).maybeSingle();

    if (!tenant) {
      check("consent row written", false, `no tenant row for client_id=${clientId}`);
      check("call_log row written", false, `no tenant row for client_id=${clientId}`);
    } else {
      const { data: consent } = await admin
        .from("consents")
        .select("id, disclosure_version")
        .eq("tenant_id", tenant.id)
        .eq("caller_identifier", from)
        .eq("channel", "voice")
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      check("consent row written", Boolean(consent), consent ? `disclosure_version=${consent.disclosure_version}` : "not found");

      const { data: callLog } = await admin
        .from("call_logs")
        .select("id, status")
        .eq("tenant_id", tenant.id)
        .eq("call_sid", callSid)
        .maybeSingle();
      check("call_log row written", Boolean(callLog), callLog ? `status=${callLog.status}` : "not found");

      // 5. status-callback updates call_log
      const statusParams: Record<string, string> = { CallSid: callSid, CallStatus: "completed" };
      const statusBody = new URLSearchParams(statusParams).toString();
      const statusSignature = await computeTwilioSignature(authToken, statusTarget, statusParams);
      const statusRes = await fetch(statusTarget, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", [TWILIO_SIGNATURE_HEADER]: statusSignature },
        body: statusBody,
      });
      check("status-callback accepted", statusRes.status === 204, `status=${statusRes.status}`);

      const { data: updatedLog } = await admin.from("call_logs").select("status").eq("tenant_id", tenant.id).eq("call_sid", callSid).maybeSingle();
      check("call_log status updated to completed", updatedLog?.status === "completed", `status=${updatedLog?.status}`);
    }
  } else {
    check("consent + call_log DB checks", false, "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL not set");
  }

  return results;
}

function printResults(label: string, results: CheckResult[]): boolean {
  console.log(`\n=== ${label} ===`);
  let allPass = true;
  for (const r of results) {
    console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.name} - ${r.detail}`);
    if (!r.pass) allPass = false;
  }
  return allPass;
}

async function main() {
  let overallPass = true;

  const localUrl = "http://localhost:3000";
  if (await isReachable(localUrl)) {
    const results = await simulateAgainst(localUrl);
    overallPass = printResults(`localhost (${localUrl})`, results) && overallPass;
  } else {
    console.log(`\n=== localhost (${localUrl}) ===\nSKIPPED - nothing listening on localhost:3000. Run "npm run dev -w apps/web" first to include this target.`);
  }

  if (deployedUrl) {
    const results = await simulateAgainst(deployedUrl);
    overallPass = printResults(`deployed (${deployedUrl})`, results) && overallPass;
  } else {
    console.log("\nNo --url given and NEXT_PUBLIC_SITE_URL not set - skipped the deployed target.");
  }

  process.exitCode = overallPass ? 0 : 1;
}

main();
