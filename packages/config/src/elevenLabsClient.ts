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
 *  - turn taking: https://elevenlabs.io/docs/agents-platform/customization/conversation-flow
 *    (conversation_config.turn.turn_eagerness, conversation_config.turn.turn_timeout)
 *  - skip_turn tool: https://elevenlabs.io/docs/agents-platform/customization/tools/system-tools/skip-turn
 *    (conversation_config.agent.prompt.built_in_tools.skip_turn)
 *  - agent testing: https://elevenlabs.io/docs/api-reference/tests/create and
 *    https://elevenlabs.io/docs/api-reference/tests/run-tests
 *    (create a scripted chat_history + natural-language success_condition,
 *    then run it against a live agent by test_id). run-tests starts the run
 *    asynchronously ("pending"); GET /v1/convai/test-invocations/{id} (found
 *    by probing the live API, not in the published docs pages) polls for
 *    the resolved per-test status and condition_result.
 */

const BASE_URL = "https://api.elevenlabs.io/v1";

/** Shared between provisioning (sets the agent's real limit) and the browser widget (displays it). */
export const WEB_VOICE_MAX_DURATION_SECONDS = 120;

export type TurnEagerness = "patient" | "normal" | "eager";

export interface ElevenLabsAgent {
  agent_id: string;
  conversation_config?: {
    agent?: {
      first_message?: string;
      prompt?: {
        prompt?: string;
        built_in_tools?: {
          skip_turn?: { type?: string; name?: string; params?: { system_tool_type?: string } } | null;
        };
      };
    };
    conversation?: {
      max_duration_seconds?: number;
    };
    turn?: {
      turn_eagerness?: TurnEagerness;
      turn_timeout?: number;
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
  turnEagerness: TurnEagerness;
  turnTimeoutSeconds: number;
  enableSkipTurn: boolean;
}

export async function updateAgent(apiKey: string, agentId: string, input: UpdateAgentInput): Promise<ElevenLabsAgent> {
  const body = {
    conversation_config: {
      agent: {
        first_message: input.firstMessage,
        prompt: {
          prompt: input.systemPrompt,
          built_in_tools: {
            skip_turn: input.enableSkipTurn
              ? { type: "system", name: "skip_turn", params: { system_tool_type: "skip_turn" } }
              : null,
          },
        },
      },
      conversation: {
        max_duration_seconds: input.maxDurationSeconds,
      },
      turn: {
        turn_eagerness: input.turnEagerness,
        turn_timeout: input.turnTimeoutSeconds,
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

export interface CreateAgentTestInput {
  name: string;
  /** A single scripted caller line to evaluate the agent's next reply against. */
  userMessage: string;
  /** Natural-language pass condition, evaluated by ElevenLabs' judge model. */
  successCondition: string;
}

/** Creates an "llm" (response) unit test and returns its test_id. */
export async function createAgentTest(apiKey: string, input: CreateAgentTestInput): Promise<string> {
  const res = await elevenLabsFetch(apiKey, "/convai/agent-testing/create", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      type: "llm",
      chat_history: [{ role: "user", time_in_call_secs: 0, message: input.userMessage }],
      success_condition: input.successCondition,
    }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs createAgentTest failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

export interface TestInvocationRun {
  test_id: string;
  test_name: string;
  status: string;
  condition_result?: { result?: string; rationale?: { summary?: string } } | null;
  agent_responses?: Array<{ message?: string | null }> | null;
}

export interface TestInvocation {
  id: string;
  agent_id: string;
  test_runs: TestInvocationRun[];
}

/**
 * Starts running previously created tests against a live agent and returns
 * the test invocation id. Documented request shape:
 * `{ tests: [{ test_id }] }`. The run starts asynchronously - each
 * test_runs[].status comes back "pending" in this response; poll
 * getTestInvocation() for the final per-test status and condition_result.
 */
export async function runAgentTests(apiKey: string, agentId: string, testIds: string[]): Promise<TestInvocation> {
  const res = await elevenLabsFetch(apiKey, `/convai/agents/${encodeURIComponent(agentId)}/run-tests`, {
    method: "POST",
    body: JSON.stringify({ tests: testIds.map((test_id) => ({ test_id })) }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs runAgentTests failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<TestInvocation>;
}

/**
 * Reads back a test invocation's current state. Not in the published docs
 * pages (which describe create and run-tests but not this one) - found by
 * probing the live API for the shape the run-tests response's "id" field
 * (test_invocation_id) resolves against: GET /v1/convai/test-invocations/{id}.
 */
export async function getTestInvocation(apiKey: string, invocationId: string): Promise<TestInvocation> {
  const res = await elevenLabsFetch(apiKey, `/convai/test-invocations/${encodeURIComponent(invocationId)}`);
  if (!res.ok) {
    throw new Error(`ElevenLabs getTestInvocation failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<TestInvocation>;
}
