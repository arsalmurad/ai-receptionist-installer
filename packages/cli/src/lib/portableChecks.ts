import {
  computeTwilioSignature,
  TWILIO_SIGNATURE_HEADER,
  getAgent,
  getDomainStatusByName,
  getIncomingPhoneNumber,
  VERIFY_TOKEN_HEADER,
  VERIFY_RATE_LIMIT_KEY_HEADER,
  type TargetConfig,
} from "@frontdesk-kit/config";
import { randomUUID } from "node:crypto";
import { buildDesiredUrls, needsTwilioUpdate } from "./twilioProvision";
import { findNeedlesInText, secretNeedles } from "./secretScan";
import { runGate, Skip, Fail } from "./gate";
import type { GateResult } from "./report";
import { checkSeoBasics } from "./seoCheck";

/**
 * The gates that only need a live URL plus whichever vendor credentials are
 * available - the "portable" half of the install checks, usable against any
 * AI receptionist install that follows this project's conventions (the
 * consent-gate contract, an ElevenLabs voice agent, a Twilio voice webhook),
 * not only ones provisioned by this exact repo. `frontdesk verify` runs
 * these plus repo-internal gates (typecheck+build, RLS isolation,
 * media-gate, llm-gateway auth); `frontdesk check --target` runs only
 * these, against a target it never had to be built from this repo to
 * satisfy.
 */
export async function runPortableChecks(target: TargetConfig): Promise<GateResult[]> {
  const baseUrl = target.baseUrl.replace(/\/$/, "");

  return [
    await checkPagesLoad(baseUrl, target.extraPaths ?? []),
    await checkConsentGate(baseUrl, target.verifyToken),
    await checkWebhookSignature(baseUrl, target.twilio?.authToken),
    await checkPhoneNumberConfig(baseUrl, target.twilio),
    await checkVoiceAgentSettings(baseUrl, target.elevenLabs),
    await checkEmailDomain(target.resend),
    await checkSecretScanDeployed(baseUrl, target.secrets?.names ?? [], target.secrets?.values ?? []),
    await checkRateLimits(baseUrl, target.chatRateLimitPerIp, target.verifyToken),
    await checkSeoBasics(baseUrl, target.expectedTitleContains),
  ];
}

export async function checkPagesLoad(baseUrl: string, extraPaths: string[]): Promise<GateResult> {
  return runGate("2 pages 200", async () => {
    const paths = ["/", ...extraPaths];
    for (const path of paths) {
      const res = await fetch(`${baseUrl}${path}`);
      if (res.status !== 200) throw new Fail(`${path} returned ${res.status}`);
    }
    return `${paths.join(", ")} all returned 200`;
  });
}

export async function checkConsentGate(baseUrl: string, verifyToken?: string): Promise<GateResult> {
  return runGate("3 consent gate", async () => {
    const chatHeaders: Record<string, string> = { "content-type": "application/json" };
    if (verifyToken) chatHeaders[VERIFY_TOKEN_HEADER] = verifyToken;

    const withoutConsent = await fetch(`${baseUrl}/api/chat/message`, {
      method: "POST",
      headers: chatHeaders,
      body: JSON.stringify({ consentId: "00000000-0000-0000-0000-000000000000", sessionId: "00000000-0000-0000-0000-000000000000", message: "hi" }),
    });
    if (withoutConsent.status !== 403) throw new Fail(`expected 403 without consent, got ${withoutConsent.status}`);

    const consentRes = await fetch(`${baseUrl}/api/chat/consent`, { method: "POST" });
    if (consentRes.status !== 200) throw new Fail(`consent endpoint returned ${consentRes.status}`);
    const { consentId, sessionId } = (await consentRes.json()) as { consentId: string; sessionId: string };

    const withConsent = await fetch(`${baseUrl}/api/chat/message`, {
      method: "POST",
      headers: chatHeaders,
      body: JSON.stringify({ consentId, sessionId, message: "hello" }),
    });
    if (withConsent.status !== 200) throw new Fail(`expected 200 with consent, got ${withConsent.status}`);
    return "403 without consent, 200 with consent";
  });
}

export async function checkWebhookSignature(baseUrl: string, twilioAuthToken?: string): Promise<GateResult> {
  return runGate("4 voice signature", async () => {
    if (!twilioAuthToken) throw new Skip("no Twilio auth token given in target config");

    const target = `${baseUrl}/api/voice/incoming`;
    const params: Record<string, string> = {
      CallSid: `CA${"0".repeat(32)}`,
      From: "+15550001111",
      To: "+15550002222",
      CallStatus: "ringing",
    };
    const body = new URLSearchParams(params).toString();
    const validSignature = await computeTwilioSignature(twilioAuthToken, target, params);

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
  });
}

export async function checkPhoneNumberConfig(baseUrl: string, twilio?: TargetConfig["twilio"]): Promise<GateResult> {
  return runGate("5 twilio number", async () => {
    if (!twilio?.accountSid || !twilio.authToken || !twilio.phoneNumberSid || !twilio.fallbackTwimlUrl) {
      throw new Skip("target config is missing twilio.accountSid/authToken/phoneNumberSid/fallbackTwimlUrl");
    }
    const current = await getIncomingPhoneNumber(twilio.accountSid, twilio.authToken, twilio.phoneNumberSid);
    const desired = buildDesiredUrls(baseUrl, twilio.fallbackTwimlUrl);
    if (needsTwilioUpdate(current, desired)) {
      throw new Fail(`voice URL or fallback URL does not match. current=${current.voice_url} / ${current.voice_fallback_url}`);
    }
    return "voice URL and fallback URL match";
  });
}

/**
 * Structural safety check, not an exact-content match: `frontdesk verify`
 * compares the agent against one specific business's full config (exact
 * first message and system prompt); a portable target only supplies a URL
 * and credentials, with no guarantee it shares this repo's client config
 * shape, so this checks the safety properties that matter regardless of
 * business content - audio saving off, auth required, a sane call cap, and
 * documented turn-taking/skip_turn values within range.
 */
export async function checkVoiceAgentSettings(baseUrl: string, elevenLabs?: TargetConfig["elevenLabs"]): Promise<GateResult> {
  return runGate("6 elevenlabs privacy", async () => {
    if (!elevenLabs) throw new Skip("no elevenLabs credentials given in target config");
    const agent = await getAgent(elevenLabs.apiKey, elevenLabs.agentId);

    const audioSavingOff = agent.platform_settings?.privacy?.record_voice === false;
    if (!audioSavingOff) throw new Fail("audio saving (record_voice) is not off");

    const authOn = agent.platform_settings?.auth?.enable_auth === true;
    if (!authOn) throw new Fail("signed-session auth is not required");

    const hostname = new URL(baseUrl).hostname;
    const allowlist = (agent.platform_settings?.auth?.allowlist ?? []).map((e) => e.hostname);
    if (!allowlist.includes(hostname)) throw new Fail(`domain allowlist does not include ${hostname}`);

    const maxDuration = agent.conversation_config?.conversation?.max_duration_seconds;
    if (!maxDuration || maxDuration > 7200) throw new Fail(`max_duration_seconds (${maxDuration}) is unset or unreasonably high`);

    const turnEagerness = agent.conversation_config?.turn?.turn_eagerness;
    if (!turnEagerness || !["patient", "normal", "eager"].includes(turnEagerness)) {
      throw new Fail(`turn_eagerness (${turnEagerness}) is not a valid documented value`);
    }
    const turnTimeout = agent.conversation_config?.turn?.turn_timeout;
    if (!turnTimeout || turnTimeout < 1 || turnTimeout > 30) throw new Fail(`turn_timeout (${turnTimeout}) is outside the documented 1-30s range`);

    const skipTurnEnabled = agent.conversation_config?.agent?.prompt?.built_in_tools?.skip_turn?.name === "skip_turn";
    if (!skipTurnEnabled) throw new Fail("skip_turn system tool is not enabled");

    return `audio saving off, auth required, domain allowlist includes ${hostname}, max duration ${maxDuration}s, turn eagerness "${turnEagerness}", turn timeout ${turnTimeout}s, skip_turn enabled`;
  });
}

export async function checkEmailDomain(resend?: TargetConfig["resend"]): Promise<GateResult> {
  return runGate("7 resend domain", async () => {
    if (!resend) throw new Skip("no resend credentials given in target config");
    const record = await getDomainStatusByName(resend.apiKey, resend.fromDomain);
    if (!record) throw new Fail(`domain ${resend.fromDomain} not found in this Resend account`);
    if (record.status !== "verified") throw new Fail(`domain status is "${record.status}", not verified`);
    return `${resend.fromDomain} is verified`;
  });
}

const SCANNABLE_SCRIPT_EXTENSIONS = /\.(js|mjs|css)(\?|$)/;

/**
 * Remote equivalent of verify's local .next/static scan: fetches the live
 * homepage, follows every same-origin <script src> and <link rel=stylesheet
 * href>, and scans the fetched text for secret names/values. Cannot inspect
 * server-only code that never reaches the browser at all (nothing to fetch
 * for that), which is fine - that is exactly the code this gate does not
 * need to worry about.
 */
export async function checkSecretScanDeployed(baseUrl: string, names: string[], values: string[]): Promise<GateResult> {
  return runGate("8 secrets server-only", async () => {
    const needles = secretNeedles(names, values);
    if (needles.length === 0) throw new Skip("no secret names/values given in target config");

    const homepage = await fetch(baseUrl);
    if (!homepage.ok) throw new Fail(`could not fetch ${baseUrl}: ${homepage.status}`);
    const html = await homepage.text();

    const assetUrls = new Set<string>();
    for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|mjs|css)[^"]*)"/g)) {
      const url = match[1];
      if (!url || !SCANNABLE_SCRIPT_EXTENSIONS.test(url)) continue;
      assetUrls.add(new URL(url, baseUrl).toString());
    }

    const findings: string[] = [];
    for (const assetUrl of assetUrls) {
      const res = await fetch(assetUrl).catch(() => undefined);
      if (!res || !res.ok) continue;
      const text = await res.text();
      for (const matched of findNeedlesInText(text, needles)) {
        findings.push(`${matched} in ${assetUrl}`);
      }
    }

    if (findings.length > 0) {
      throw new Fail(`found in deployed bundle: ${findings.slice(0, 5).join("; ")}`);
    }
    return `scanned ${assetUrls.size} deployed script/style assets, no server-only names or values found`;
  });
}

export async function checkRateLimits(baseUrl: string, perIpLimit = 10, verifyToken?: string): Promise<GateResult> {
  return runGate("12 rate limits", async () => {
    const consentRes = await fetch(`${baseUrl}/api/chat/consent`, { method: "POST" });
    if (consentRes.status !== 200) throw new Fail(`consent endpoint returned ${consentRes.status}`);
    const { consentId, sessionId } = (await consentRes.json()) as { consentId: string; sessionId: string };

    const chatHeaders: Record<string, string> = { "content-type": "application/json" };
    if (verifyToken) {
      chatHeaders[VERIFY_TOKEN_HEADER] = verifyToken;
      chatHeaders[VERIFY_RATE_LIMIT_KEY_HEADER] = `check-${randomUUID()}`;
    }

    let lastStatus = 0;
    for (let i = 0; i < perIpLimit + 1; i++) {
      const res = await fetch(`${baseUrl}/api/chat/message`, {
        method: "POST",
        headers: chatHeaders,
        body: JSON.stringify({ consentId, sessionId, message: "hi" }),
      });
      lastStatus = res.status;
      if (res.status === 429) break;
    }

    if (lastStatus !== 429) {
      throw new Fail(`sent ${perIpLimit + 1} messages from one client and never got 429`);
    }
    return verifyToken
      ? `got 429 within ${perIpLimit + 1} messages sent under an isolated verify-only test key`
      : `got 429 within ${perIpLimit + 1} messages sent from one client`;
  });
}
