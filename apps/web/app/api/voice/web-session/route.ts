import { getConversationSignedUrl } from "@frontdesk-kit/config";
import { getEnv, getFeatureFlags } from "@/lib/env";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

const IP_LIMIT = Number(process.env.WEB_VOICE_RATE_LIMIT_PER_IP ?? 3);
const IP_WINDOW_MS = Number(process.env.WEB_VOICE_RATE_LIMIT_WINDOW_MS ?? 10 * 60 * 1000);
const DAILY_LIMIT = Number(process.env.WEB_VOICE_DAILY_CAP ?? 30);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Issues a short-lived ElevenLabs signed URL for the browser voice widget.
 * The API key never reaches the browser - only the signed URL does, and it
 * expires in 15 minutes. Rate limited per IP and per day so the widget
 * cannot be used to burn ElevenLabs minutes.
 */
export async function POST(request: Request): Promise<Response> {
  const flags = getFeatureFlags();
  if (!flags.elevenLabs) {
    return Response.json({ error: "the voice demo is not configured on this deployment" }, { status: 503 });
  }

  const ip = clientIp(request);
  const ipCheck = await checkRateLimit("web_voice_ip", ip, IP_WINDOW_MS, IP_LIMIT);
  if (!ipCheck.allowed) {
    return Response.json(
      { error: "Too many voice demo requests from this connection. Please wait a few minutes." },
      { status: 429 },
    );
  }
  const dailyCheck = await checkRateLimit("web_voice_daily", "global", DAY_MS, DAILY_LIMIT);
  if (!dailyCheck.allowed) {
    return Response.json(
      { error: "The voice demo has reached today's session limit. Please try again tomorrow." },
      { status: 429 },
    );
  }

  const env = getEnv();
  try {
    const signedUrl = await getConversationSignedUrl(env.ELEVENLABS_API_KEY as string, env.ELEVENLABS_AGENT_ID as string);
    return Response.json({ signedUrl });
  } catch (error) {
    console.error("web-session failed", error);
    return Response.json({ error: "Could not start the voice demo right now." }, { status: 502 });
  }
}
