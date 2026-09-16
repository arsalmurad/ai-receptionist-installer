import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { ENV_VAR_SPECS } from "@frontdesk-kit/config";
import { readClientConfig } from "../lib/clientConfig";
import { env } from "../lib/env";
import { run } from "../lib/exec";
import { REPO_ROOT } from "../lib/paths";
import { getOrCreateTenant } from "../lib/supabase";
import { ensureTwilioVoiceUrls, buildDesiredUrls } from "../lib/twilioProvision";
import { ensureAgentConfigured } from "../lib/elevenLabsProvision";

interface ProvisionOptions {
  dryRun?: boolean;
  url?: string;
}

function step(n: number, title: string): void {
  console.log(`\nStep ${n}: ${title}`);
}

export async function provisionCommand(clientId: string, options: ProvisionOptions): Promise<void> {
  const config = readClientConfig(clientId);
  const dryRun = Boolean(options.dryRun);
  if (dryRun) console.log("(dry run - no changes will be made)");

  // Step 1: Supabase migrations + tenant row
  step(1, "Supabase migrations and tenant row");
  const projectRef = env("SUPABASE_PROJECT_REF");
  const dbPassword = env("SUPABASE_DB_PASSWORD");
  if (!projectRef || !dbPassword) {
    console.log("SKIPPED - SUPABASE_PROJECT_REF or SUPABASE_DB_PASSWORD not set.");
  } else if (dryRun) {
    console.log(`Would run: supabase link --project-ref ${projectRef} && supabase db push --linked`);
  } else {
    run("supabase", ["link", "--project-ref", projectRef, "-p", dbPassword]);
    const push = run("supabase", ["db", "push", "--linked", "-p", dbPassword, "--yes"]);
    if (push.status !== 0) {
      console.log(`FAILED - supabase db push: ${push.stderr.trim().slice(0, 500)}`);
    } else {
      console.log("Migrations applied (or already up to date).");
    }
  }

  if (env("NEXT_PUBLIC_SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY")) {
    if (dryRun) {
      console.log(`Would ensure a tenants row for client_id="${clientId}".`);
    } else {
      const tenantId = await getOrCreateTenant(clientId, config.businessName);
      console.log(tenantId ? `Tenant row ready (${tenantId}).` : "FAILED to read/create tenant row.");
    }
  } else {
    console.log("SKIPPED tenant row - Supabase URL/service key not set.");
  }

  // Step 2: Vercel env vars
  step(2, "Vercel environment variables");
  const webDir = resolve(REPO_ROOT, "apps/web");
  const linked = existsSync(resolve(webDir, ".vercel/project.json"));
  if (!linked) {
    console.log("SKIPPED - apps/web is not linked to a Vercel project. Run `vercel link` in apps/web first.");
  } else {
    const values: Record<string, string> = { CLIENT_ID: clientId };
    for (const spec of ENV_VAR_SPECS) {
      if (spec.name === "CLIENT_ID") continue;
      const v = env(spec.name);
      if (v) values[spec.name] = v;
    }
    for (const [name, value] of Object.entries(values)) {
      if (dryRun) {
        console.log(`Would set ${name} on Vercel (production).`);
        continue;
      }
      const result = run("vercel", ["env", "add", name, "production", "--force"], { input: value, cwd: webDir });
      console.log(result.status === 0 ? `Set ${name}.` : `FAILED to set ${name}: ${result.stderr.trim().slice(0, 200)}`);
    }
  }

  // Step 3: Worker deploys
  step(3, "Cloudflare Worker deploys (llm-gateway, media-gate)");
  const cfAccount = env("CLOUDFLARE_ACCOUNT_ID");
  if (!cfAccount) {
    console.log("SKIPPED - CLOUDFLARE_ACCOUNT_ID not set.");
  } else if (dryRun) {
    console.log("Would run: wrangler deploy in workers/llm-gateway and workers/media-gate.");
  } else {
    for (const worker of ["llm-gateway", "media-gate"]) {
      const dir = resolve(REPO_ROOT, "workers", worker);
      const result = run("npx", ["--yes", "wrangler", "deploy"], {
        cwd: dir,
      });
      console.log(result.status === 0 ? `Deployed ${worker}.` : `FAILED to deploy ${worker}: ${result.stderr.trim().slice(0, 300)}`);
    }
  }

  // Step 4: Twilio number voice + fallback URL
  step(4, "Twilio phone number voice URL and fallback URL");
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const phoneNumberSid = env("TWILIO_PHONE_NUMBER_SID");
  const fallbackTwimlUrl = env("TWILIO_FALLBACK_TWIML_URL");
  if (!accountSid) {
    console.log("SKIPPED - no TWILIO_ACCOUNT_SID. This install has no Twilio account (see README).");
  } else if (!authToken || !phoneNumberSid || !fallbackTwimlUrl || !options.url) {
    console.log("SKIPPED - TWILIO_ACCOUNT_SID is set but TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER_SID, TWILIO_FALLBACK_TWIML_URL, or --url is missing.");
  } else if (dryRun) {
    console.log(`Would ensure voice URL points at ${options.url}/api/voice/incoming.`);
  } else {
    const desired = buildDesiredUrls(options.url, fallbackTwimlUrl);
    const { changed } = await ensureTwilioVoiceUrls(accountSid, authToken, phoneNumberSid, desired);
    console.log(changed ? "Updated Twilio voice URLs." : "Twilio voice URLs already correct - no change.");
  }

  // Step 5: ElevenLabs agent config
  step(5, "ElevenLabs agent configuration");
  const elevenApiKey = env("ELEVENLABS_API_KEY");
  const elevenAgentId = env("ELEVENLABS_AGENT_ID");
  if (!elevenApiKey || !elevenAgentId) {
    console.log("SKIPPED - ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID not set.");
  } else if (dryRun) {
    console.log(`Would update agent ${elevenAgentId}'s first message, system prompt, and audio saving setting.`);
  } else {
    try {
      const { changed } = await ensureAgentConfigured(elevenApiKey, elevenAgentId, config);
      console.log(changed ? "Updated ElevenLabs agent." : "ElevenLabs agent already matches config - no change.");
    } catch (error) {
      console.log(`FAILED - ${(error as Error).message}`);
    }
  }

  console.log("\nProvision run complete.");
}
