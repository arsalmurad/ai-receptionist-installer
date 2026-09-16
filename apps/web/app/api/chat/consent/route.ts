import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getTenantId } from "@/lib/tenant";
import { clientConfig } from "@/lib/clientConfig";

export const runtime = "nodejs";

/**
 * Records disclosure acceptance before any chat message is answered - the
 * chat/message route returns 403 without a valid consentId. See RESEARCH.md
 * 3.4 (universal safe-harbor disclosure), cited in docs/DESIGN_NOTES.md.
 */
export async function POST(): Promise<Response> {
  const tenantId = await getTenantId();
  const supabase = getSupabaseAdmin();

  const { data: consent, error: consentError } = await supabase
    .from("consents")
    .insert({
      tenant_id: tenantId,
      channel: "chat",
      disclosure_version: clientConfig.disclosureVersion,
    })
    .select("id")
    .single();

  if (consentError || !consent) {
    return Response.json({ error: "could not record consent" }, { status: 500 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .insert({ tenant_id: tenantId, consent_id: consent.id })
    .select("id")
    .single();

  if (sessionError || !session) {
    return Response.json({ error: "could not start session" }, { status: 500 });
  }

  return Response.json({ consentId: consent.id, sessionId: session.id });
}
