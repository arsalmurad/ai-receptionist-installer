import { buildSystemPrompt, buildVoiceDisclosureLine, getAgent, updateAgent, type ClientConfig } from "@frontdesk-kit/config";

export interface ElevenLabsDesiredState {
  firstMessage: string;
  systemPrompt: string;
}

export function buildDesiredAgentState(config: ClientConfig): ElevenLabsDesiredState {
  return {
    firstMessage: buildVoiceDisclosureLine(config.businessName),
    systemPrompt: buildSystemPrompt(config),
  };
}

export function agentMatchesDesired(
  agent: Awaited<ReturnType<typeof getAgent>>,
  desired: ElevenLabsDesiredState,
): boolean {
  const first = agent.conversation_config?.agent?.first_message ?? "";
  const prompt = agent.conversation_config?.agent?.prompt?.prompt ?? "";
  const audioSavingOff = agent.platform_settings?.privacy?.record_voice === false;
  return first === desired.firstMessage && prompt === desired.systemPrompt && audioSavingOff;
}

export async function ensureAgentConfigured(
  apiKey: string,
  agentId: string,
  config: ClientConfig,
): Promise<{ changed: boolean }> {
  const desired = buildDesiredAgentState(config);
  const current = await getAgent(apiKey, agentId);

  if (agentMatchesDesired(current, desired)) {
    return { changed: false };
  }

  await updateAgent(apiKey, agentId, {
    firstMessage: desired.firstMessage,
    systemPrompt: desired.systemPrompt,
    disableAudioSaving: true,
  });
  return { changed: true };
}
