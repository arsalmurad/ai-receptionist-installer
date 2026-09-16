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

export interface ElevenLabsAgent {
  agent_id: string;
  conversation_config?: {
    agent?: {
      first_message?: string;
      prompt?: { prompt?: string };
    };
  };
  platform_settings?: {
    privacy?: { record_voice?: boolean };
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
}

export async function updateAgent(apiKey: string, agentId: string, input: UpdateAgentInput): Promise<ElevenLabsAgent> {
  const body = {
    conversation_config: {
      agent: {
        first_message: input.firstMessage,
        prompt: { prompt: input.systemPrompt },
      },
    },
    platform_settings: {
      privacy: { record_voice: !input.disableAudioSaving },
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
