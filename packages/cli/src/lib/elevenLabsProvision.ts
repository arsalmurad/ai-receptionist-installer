import {
  buildSystemPrompt,
  buildVoiceDisclosureLine,
  getAgent,
  updateAgent,
  WEB_VOICE_MAX_DURATION_SECONDS,
  type ClientConfig,
} from "@frontdesk-kit/config";

export interface ElevenLabsDesiredState {
  firstMessage: string;
  systemPrompt: string;
  requireAuth: boolean;
  allowedHostnames: string[];
  maxDurationSeconds: number;
}

export function buildDesiredAgentState(config: ClientConfig, siteHostname?: string): ElevenLabsDesiredState {
  return {
    firstMessage: buildVoiceDisclosureLine(config.businessName),
    systemPrompt: buildSystemPrompt(config),
    requireAuth: true,
    allowedHostnames: siteHostname ? [siteHostname] : [],
    maxDurationSeconds: WEB_VOICE_MAX_DURATION_SECONDS,
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

  return (
    first === desired.firstMessage &&
    prompt === desired.systemPrompt &&
    audioSavingOff &&
    authOn === desired.requireAuth &&
    durationMatches &&
    allowlistMatches
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
  });
  return { changed: true };
}
