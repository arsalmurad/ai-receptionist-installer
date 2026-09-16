import { buildSystemPrompt } from "@frontdesk-kit/config";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getTenantId } from "@/lib/tenant";
import { clientConfig } from "@/lib/clientConfig";
import { askGateway } from "@/lib/llmGatewayClient";
import { notifyOwnerOfLead } from "@/lib/ownerNotify";

export const runtime = "nodejs";

interface RequestBody {
  consentId?: string;
  sessionId?: string;
  message?: string;
}

export async function POST(request: Request): Promise<Response> {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const { consentId, sessionId, message } = body;
  if (!consentId || !sessionId || !message) {
    return Response.json({ error: "consentId, sessionId, and message are required" }, { status: 400 });
  }

  const tenantId = await getTenantId();
  const supabase = getSupabaseAdmin();

  // Consent gate: no valid consent for this tenant, no answer. Returns 403
  // per the build spec so the chat widget without an accepted disclosure
  // never gets a substantive response.
  const { data: consent } = await supabase
    .from("consents")
    .select("id")
    .eq("id", consentId)
    .eq("tenant_id", tenantId)
    .eq("channel", "chat")
    .maybeSingle();

  if (!consent) {
    return Response.json({ error: "consent required" }, { status: 403 });
  }

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .eq("consent_id", consentId)
    .maybeSingle();

  if (!session) {
    return Response.json({ error: "consent required" }, { status: 403 });
  }

  const { data: priorMessages } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20);

  await supabase.from("chat_messages").insert({
    tenant_id: tenantId,
    session_id: sessionId,
    role: "user",
    content: message,
  });

  const gatewayResult = await askGateway({
    systemPrompt: buildSystemPrompt(clientConfig),
    userMessage: message,
    history: (priorMessages ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string })),
    faq: clientConfig.faq,
  });

  await supabase.from("chat_messages").insert({
    tenant_id: tenantId,
    session_id: sessionId,
    role: "assistant",
    content: gatewayResult.reply,
  });

  let leadCaptured = false;
  if (!gatewayResult.grounded) {
    const { error: leadError } = await supabase.from("leads").insert({
      tenant_id: tenantId,
      source: "chat",
      message,
      status: "new",
    });
    leadCaptured = !leadError;
    if (leadCaptured) {
      // Fire the owner alert synchronously - RESEARCH.md 2.1: leads
      // contacted within 5 minutes convert far more often, so this cannot
      // be a fire-and-forget queued job.
      await notifyOwnerOfLead({ source: "chat", message });
    }
  }

  return Response.json({
    reply: gatewayResult.reply,
    grounded: gatewayResult.grounded,
    leadCaptured,
  });
}
