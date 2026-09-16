import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { getAgent, getDomainStatusByName, getIncomingPhoneNumber, ENV_VAR_SPECS } from "@frontdesk-kit/config";
import { readClientConfig } from "../lib/clientConfig";
import { env } from "../lib/env";
import { run } from "../lib/exec";
import { REPO_ROOT } from "../lib/paths";
import { buildDesiredAgentState, agentMatchesDesired } from "../lib/elevenLabsProvision";
import { buildDesiredUrls, needsTwilioUpdate } from "../lib/twilioProvision";

interface DoctorOptions {
  url?: string;
}

interface DriftFinding {
  area: string;
  detail: string;
}

export async function doctorCommand(clientId: string, options: DoctorOptions): Promise<void> {
  const config = readClientConfig(clientId);
  const findings: DriftFinding[] = [];
  const checked: string[] = [];

  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const phoneNumberSid = env("TWILIO_PHONE_NUMBER_SID");
  const fallbackTwimlUrl = env("TWILIO_FALLBACK_TWIML_URL");
  if (accountSid && authToken && phoneNumberSid && fallbackTwimlUrl && options.url) {
    checked.push("Twilio voice URL");
    try {
      const current = await getIncomingPhoneNumber(accountSid, authToken, phoneNumberSid);
      const desired = buildDesiredUrls(options.url, fallbackTwimlUrl);
      if (needsTwilioUpdate(current, desired)) {
        findings.push({ area: "Twilio voice URL", detail: `points at "${current.voice_url}", expected ".../api/voice/incoming"` });
      }
    } catch (error) {
      findings.push({ area: "Twilio voice URL", detail: `could not read: ${(error as Error).message}` });
    }
  }

  const elevenApiKey = env("ELEVENLABS_API_KEY");
  const elevenAgentId = env("ELEVENLABS_AGENT_ID");
  if (elevenApiKey && elevenAgentId) {
    checked.push("ElevenLabs agent config");
    try {
      const agent = await getAgent(elevenApiKey, elevenAgentId);
      if (!agentMatchesDesired(agent, buildDesiredAgentState(config))) {
        findings.push({ area: "ElevenLabs agent", detail: "first message, prompt, or audio-saving setting no longer matches config.json" });
      }
    } catch (error) {
      findings.push({ area: "ElevenLabs agent", detail: `could not read: ${(error as Error).message}` });
    }
  }

  const resendApiKey = env("RESEND_API_KEY");
  const resendDomain = env("RESEND_FROM_DOMAIN");
  if (resendApiKey && resendDomain) {
    checked.push("Resend domain status");
    try {
      const record = await getDomainStatusByName(resendApiKey, resendDomain);
      if (!record || record.status !== "verified") {
        findings.push({ area: "Resend domain", detail: `status is "${record?.status ?? "not found"}", owner notifications will silently fail to send` });
      }
    } catch (error) {
      findings.push({ area: "Resend domain", detail: `could not read: ${(error as Error).message}` });
    }
  }

  const webDir = resolve(REPO_ROOT, "apps/web");
  if (existsSync(resolve(webDir, ".vercel/project.json"))) {
    checked.push("Vercel env vars present");
    const list = run("vercel", ["env", "ls", "production"], { cwd: webDir });
    const requiredNames = ENV_VAR_SPECS.filter((s) => s.required).map((s) => s.name);
    for (const name of requiredNames) {
      if (!list.stdout.includes(name)) {
        findings.push({ area: "Vercel env", detail: `${name} is required but not found in production env vars` });
      }
    }
  }

  console.log(`Checked: ${checked.length ? checked.join(", ") : "nothing - no credentials/URL available to check drift against"}`);
  if (findings.length === 0) {
    console.log("No drift found.");
    return;
  }

  console.log(`\n${findings.length} drift finding(s):`);
  for (const f of findings) {
    console.log(`- [${f.area}] ${f.detail}`);
  }
  process.exitCode = 1;
}
