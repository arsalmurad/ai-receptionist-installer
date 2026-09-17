import {
  buildSystemPrompt,
  buildVoiceDisclosureLine,
  getAgent,
  updateAgent,
  WEB_VOICE_MAX_DURATION_SECONDS,
  type ClientConfig,
  type TurnEagerness,
} from "@frontdesk-kit/config";

/**
 * Voice-only additions to the shared system prompt. Chat has no ASR layer
 * and no skip_turn tool, so these stay out of buildSystemPrompt() and are
 * appended only for the phone/browser voice agent - see round 3 feedback on
 * the agent answering phantom phrases transcribed from background noise.
 */
const VOICE_NOISE_INSTRUCTIONS = [
  "If what you heard is fragmentary, off-topic, or doesn't sound like a caller speaking to you, don't answer it. Use skip_turn.",
  "If it happens twice in a row, say once: \"Sorry, I didn't catch that. What can I help you with?\"",
  "Never assume a question the caller didn't clearly ask.",
].join(" ");

export function buildVoiceSystemPrompt(config: ClientConfig): string {
  return `${buildSystemPrompt(config)}\n\n${VOICE_NOISE_INSTRUCTIONS}`;
}

// "patient" waits longer before deciding the caller has finished speaking,
// and a 10 second turn_timeout (within ElevenLabs' documented 1-30s range,
// on the higher end of their 5-10s "casual conversation" guidance) gives a
// noise blip more room to not get treated as a completed turn - see
// docs/DESIGN_NOTES.md for the full reasoning and what this does and does
// not fix.
export const VOICE_TURN_EAGERNESS: TurnEagerness = "patient";
export const VOICE_TURN_TIMEOUT_SECONDS = 10;

export interface ElevenLabsDesiredState {
  firstMessage: string;
  systemPrompt: string;
  requireAuth: boolean;
  allowedHostnames: string[];
  maxDurationSeconds: number;
  turnEagerness: TurnEagerness;
  turnTimeoutSeconds: number;
  enableSkipTurn: boolean;
}

export function buildDesiredAgentState(config: ClientConfig, siteHostname?: string): ElevenLabsDesiredState {
  return {
    firstMessage: buildVoiceDisclosureLine(config.businessName),
    systemPrompt: buildVoiceSystemPrompt(config),
    requireAuth: true,
    allowedHostnames: siteHostname ? [siteHostname] : [],
    maxDurationSeconds: WEB_VOICE_MAX_DURATION_SECONDS,
    turnEagerness: VOICE_TURN_EAGERNESS,
    turnTimeoutSeconds: VOICE_TURN_TIMEOUT_SECONDS,
    enableSkipTurn: true,
  };
}

export function agentMatchesDesired(
  agent: Awaited<ReturnType<typeof getAgent>>,
  desired: ElevenLabsDesiredState,
): boolean {
  const first = agent.conversation_config?.agent?.first_message ?? "";
  const prompt = agent.conversation_config?.agent?.prompt?.prompt ?? "";
  const audioSavingOff = agent.platform_settings?.privacy?.record_voice === false;
  const authOn = agent.platform_settings?.auth?.enable_auth === true;
  const maxDuration = agent.conversation_config?.conversation?.max_duration_seconds;
  const durationMatches = maxDuration === desired.maxDurationSeconds;

  const allowlist = (agent.platform_settings?.auth?.allowlist ?? []).map((entry) => entry.hostname);
  const allowlistMatches = desired.allowedHostnames.every((h) => allowlist.includes(h));

  const turnEagernessMatches = agent.conversation_config?.turn?.turn_eagerness === desired.turnEagerness;
  const turnTimeoutMatches = agent.conversation_config?.turn?.turn_timeout === desired.turnTimeoutSeconds;
  const skipTurnMatches =
    (agent.conversation_config?.agent?.prompt?.built_in_tools?.skip_turn?.name === "skip_turn") === desired.enableSkipTurn;

  return (
    first === desired.firstMessage &&
    prompt === desired.systemPrompt &&
    audioSavingOff &&
    authOn === desired.requireAuth &&
    durationMatches &&
    allowlistMatches &&
    turnEagernessMatches &&
    turnTimeoutMatches &&
    skipTurnMatches
  );
}

export async function ensureAgentConfigured(
  apiKey: string,
  agentId: string,
  config: ClientConfig,
  siteHostname?: string,
): Promise<{ changed: boolean }> {
  const desired = buildDesiredAgentState(config, siteHostname);
  const current = await getAgent(apiKey, agentId);

  if (agentMatchesDesired(current, desired)) {
    return { changed: false };
  }

  await updateAgent(apiKey, agentId, {
    firstMessage: desired.firstMessage,
    systemPrompt: desired.systemPrompt,
    disableAudioSaving: true,
    requireAuth: desired.requireAuth,
    allowedHostnames: desired.allowedHostnames,
    maxDurationSeconds: desired.maxDurationSeconds,
    turnEagerness: desired.turnEagerness,
    turnTimeoutSeconds: desired.turnTimeoutSeconds,
    enableSkipTurn: desired.enableSkipTurn,
  });
  return { changed: true };
}
