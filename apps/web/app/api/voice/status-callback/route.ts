import { getEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getTenantId } from "@/lib/tenant";
import { verifyTwilioRequest } from "@/lib/twilioAuth";
import { notifyOwnerOfCall } from "@/lib/ownerNotify";

export const runtime = "nodejs";

const TERMINAL_STATUSES = new Set(["completed", "no-answer", "busy", "failed", "canceled"]);

/**
 * Twilio's call status callback. Updates the call_log row written by
 * /api/voice/incoming so the dashboard reflects how the call actually ended,
 * not just that it started - guards against RESEARCH.md 1.5 (resolution
 * illusion: a clean-looking transcript with a silently failed outcome).
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

  const tenantId = await getTenantId();
  const supabase = getSupabaseAdmin();

  const callSid = params.CallSid ?? "";
  const callStatus = params.CallStatus ?? "unknown";

  await supabase
    .from("call_logs")
    .update({ status: callStatus, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("call_sid", callSid);

  if (TERMINAL_STATUSES.has(callStatus)) {
    await notifyOwnerOfCall({ fromNumber: params.From ?? null, status: callStatus });
  }

  // A 204 response must have a null body - even an empty string throws
  // ("Response constructor: Invalid response status code 204").
  return new Response(null, { status: 204 });
}
