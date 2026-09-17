import { buildVoiceDisclosureLine, registerTwilioCall } from "@frontdesk-kit/config";
import { getEnv, getFeatureFlags } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getTenantId } from "@/lib/tenant";
import { clientConfig } from "@/lib/clientConfig";
import { verifyTwilioRequest, xmlEscape } from "@/lib/twilioAuth";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

const IP_LIMIT = Number(process.env.VOICE_RATE_LIMIT_PER_IP ?? 20);
const IP_WINDOW_MS = Number(process.env.VOICE_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000);

function wrapWithDisclosure(twiml: string, disclosureSay: string): string {
  const match = twiml.match(/<Response>([\s\S]*)<\/Response>/i);
  const inner = match ? match[1] : twiml;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${disclosureSay}${inner}</Response>`;
}

/**
 * Twilio's inbound voice webhook. Validates X-Twilio-Signature (403 if
 * invalid or missing - this is what lets frontdesk verify's gate 4 and
 * scripts/simulate-call.ts prove the route rejects unsigned/tampered
 * requests without a real Twilio account). Always speaks the disclosure
 * line itself before connecting, so the guarantee holds even if the
 * ElevenLabs handoff fails - see docs/DESIGN_NOTES.md.
 */
export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  if (!env.TWILIO_AUTH_TOKEN) {
    return new Response("twilio is not configured on this deployment", { status: 500 });
  }

  const { valid, params } = await verifyTwilioRequest(request, env.TWILIO_AUTH_TOKEN);
  if (!valid) {
    return new Response("invalid signature", { status: 403 });
  }

  // Note: on a real Twilio call this counts Twilio's own edge IP, not the
  // caller's phone number - see docs/DESIGN_NOTES.md. It still caps the
  // cost of a leaked or brute-forced signing key.
  const ipCheck = await checkRateLimit("voice_ip", clientIp(request), IP_WINDOW_MS, IP_LIMIT);
  if (!ipCheck.allowed) {
    return new Response("rate limit exceeded", { status: 429 });
  }

  const tenantId = await getTenantId();
  const supabase = getSupabaseAdmin();

  const callSid = params.CallSid ?? "";
  const fromNumber = params.From ?? null;
  const toNumber = params.To ?? null;
  const callStatus = params.CallStatus ?? "in-progress";

  const { data: consent } = await supabase
    .from("consents")
    .insert({
      tenant_id: tenantId,
      channel: "voice",
      disclosure_version: clientConfig.disclosureVersion,
      caller_identifier: fromNumber,
    })
    .select("id")
    .single();

  await supabase.from("call_logs").upsert(
    {
      tenant_id: tenantId,
      call_sid: callSid,
      from_number: fromNumber,
      to_number: toNumber,
      status: callStatus,
      consent_id: consent?.id ?? null,
    },
    { onConflict: "tenant_id,call_sid" },
  );

  const disclosureSay = `<Say>${xmlEscape(buildVoiceDisclosureLine(clientConfig.businessName))}</Say>`;
  const flags = getFeatureFlags();

  if (flags.elevenLabs) {
    try {
      const agentTwiml = await registerTwilioCall(env.ELEVENLABS_API_KEY as string, {
        agentId: env.ELEVENLABS_AGENT_ID as string,
        fromNumber: fromNumber ?? "",
        toNumber: toNumber ?? "",
      });
      return new Response(wrapWithDisclosure(agentTwiml, disclosureSay), {
        status: 200,
        headers: { "content-type": "text/xml" },
      });
    } catch (error) {
      console.error("registerTwilioCall failed, using fallback TwiML", error);
    }
  }

  const fallback = env.OWNER_FALLBACK_PHONE
    ? `<?xml version="1.0" encoding="UTF-8"?><Response>${disclosureSay}<Say>Our AI agent is not available right now. Connecting you to the office.</Say><Dial>${xmlEscape(env.OWNER_FALLBACK_PHONE)}</Dial></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response>${disclosureSay}<Say>Our AI agent is not available right now. Please leave a message after the tone.</Say><Record maxLength="120" /></Response>`;

  return new Response(fallback, { status: 200, headers: { "content-type": "text/xml" } });
}
