import { buildSystemPrompt, CANNOT_ANSWER_FALLBACK, type LlmGatewayResponse } from "@frontdesk-kit/config";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getTenantId } from "@/lib/tenant";
import { clientConfig } from "@/lib/clientConfig";
import { askGateway } from "@/lib/llmGatewayClient";
import { notifyOwnerOfLead } from "@/lib/ownerNotify";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

interface RequestBody {
  consentId?: string;
  sessionId?: string;
  message?: string;
}

const IP_LIMIT = Number(process.env.CHAT_RATE_LIMIT_PER_IP ?? 10);
const IP_WINDOW_MS = Number(process.env.CHAT_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000);
const DAILY_LIMIT = Number(process.env.CHAT_RATE_LIMIT_DAILY ?? 200);
const DAY_MS = 24 * 60 * 60 * 1000;

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

  const ip = clientIp(request);
  const ipCheck = await checkRateLimit("chat_ip", ip, IP_WINDOW_MS, IP_LIMIT);
  if (!ipCheck.allowed) {
    return Response.json(
      { error: "You've sent a lot of messages in a short time. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }
  const dailyCheck = await checkRateLimit("chat_daily", "global", DAY_MS, DAILY_LIMIT);
  if (!dailyCheck.allowed) {
    return Response.json(
      { error: "This demo has reached its message limit for today. Please try again tomorrow." },
      { status: 429 },
    );
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

  // A provider outage or quota limit must degrade to the same "let me take
  // your info" response as a genuine out-of-scope question, never a raw
  // 500 - a caller should never see the assistant fail open into silence,
  // and it must never look like the assistant is more capable than it is.
  let gatewayResult: LlmGatewayResponse;
  try {
    gatewayResult = await askGateway({
      systemPrompt: buildSystemPrompt(clientConfig),
      userMessage: message,
      history: (priorMessages ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content as string })),
      faq: clientConfig.faq,
    });
  } catch (error) {
    console.error("llm-gateway call failed", error);
    gatewayResult = { reply: CANNOT_ANSWER_FALLBACK, provider: "mock", grounded: false };
  }

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
