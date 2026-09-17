/**
 * Minimal ElevenLabs Conversational AI REST client, built directly from
 * current docs (no SDK dependency):
 *  - auth: https://elevenlabs.io/docs/api-reference/authentication (xi-api-key header)
 *  - agent read/update: https://elevenlabs.io/docs/api-reference/agents/{get,update}
 *  - audio saving: https://elevenlabs.io/docs/agents-platform/customization/privacy/audio-saving
 *    (platform_settings.privacy.record_voice = false)
 *  - Twilio handoff: https://elevenlabs.io/docs/agents-platform/phone-numbers/twilio-integration/register-call
 *    (keeps our own webhook in control instead of importing the number into
 *    ElevenLabs - see docs/DESIGN_NOTES.md)
 */

const BASE_URL = "https://api.elevenlabs.io/v1";

/** Shared between provisioning (sets the agent's real limit) and the browser widget (displays it). */
export const WEB_VOICE_MAX_DURATION_SECONDS = 120;

export interface ElevenLabsAgent {
  agent_id: string;
  conversation_config?: {
    agent?: {
      first_message?: string;
      prompt?: { prompt?: string };
    };
    conversation?: {
      max_duration_seconds?: number;
    };
  };
  platform_settings?: {
    privacy?: { record_voice?: boolean };
    auth?: {
      enable_auth?: boolean;
      allowlist?: Array<{ hostname: string }>;
    };
  };
}

async function elevenLabsFetch(apiKey: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  return res;
}

export async function getAgent(apiKey: string, agentId: string): Promise<ElevenLabsAgent> {
  const res = await elevenLabsFetch(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`);
  if (!res.ok) {
    throw new Error(`ElevenLabs getAgent failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<ElevenLabsAgent>;
}

export interface UpdateAgentInput {
  firstMessage: string;
  systemPrompt: string;
  disableAudioSaving: boolean;
  /** Require a signed URL to start a conversation - see docs/agents-platform/customization/authentication. */
  requireAuth: boolean;
  /** Hostnames allowed to embed the widget when requireAuth is on. */
  allowedHostnames: string[];
  maxDurationSeconds: number;
}

export async function updateAgent(apiKey: string, agentId: string, input: UpdateAgentInput): Promise<ElevenLabsAgent> {
  const body = {
    conversation_config: {
      agent: {
        first_message: input.firstMessage,
        prompt: { prompt: input.systemPrompt },
      },
      conversation: {
        max_duration_seconds: input.maxDurationSeconds,
      },
    },
    platform_settings: {
      privacy: { record_voice: !input.disableAudioSaving },
      auth: {
        enable_auth: input.requireAuth,
        allowlist: input.allowedHostnames.map((hostname) => ({ hostname })),
      },
    },
  };

  const res = await elevenLabsFetch(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs updateAgent failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<ElevenLabsAgent>;
}

export interface RegisterCallInput {
  agentId: string;
  fromNumber: string;
  toNumber: string;
}

/**
 * Registers an in-progress Twilio call with an ElevenLabs agent and returns
 * the TwiML to hand back to Twilio to connect the call to that agent.
 */
export async function registerTwilioCall(apiKey: string, input: RegisterCallInput): Promise<string> {
  const res = await elevenLabsFetch(apiKey, "/convai/twilio/register-call", {
    method: "POST",
    body: JSON.stringify({
      agent_id: input.agentId,
      from_number: input.fromNumber,
      to_number: input.toNumber,
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs registerTwilioCall failed: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string") return parsed;
  } catch {
    // not JSON - the body is already the raw TwiML string
  }
  return text;
}

/**
 * Gets a short-lived signed URL for a browser to open a WebSocket
 * conversation with a private (auth-required) agent, per
 * https://elevenlabs.io/docs/agents-platform/customization/authentication.
 * The URL embeds a conversation_signature and expires in 15 minutes -
 * never cache or reuse it, request a fresh one per session.
 */
export async function getConversationSignedUrl(apiKey: string, agentId: string): Promise<string> {
  const res = await elevenLabsFetch(
    apiKey,
    `/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs getConversationSignedUrl failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { signed_url: string };
  return data.signed_url;
}
