import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { createAgentTest, runAgentTests, getTestInvocation, type TestInvocationRun } from "@frontdesk-kit/config";

/**
 * Runs 3 scripted ElevenLabs agent tests against the live voice agent,
 * per round 3 feedback: the agent should not answer garbled noise or
 * unrelated speech as if it were a real question, but should still answer
 * a real one from the client's config. Uses ElevenLabs' agent-testing API
 * (https://elevenlabs.io/docs/api-reference/tests/create and
 * .../tests/run-tests), not the deprecated /simulate-conversation endpoint.
 *
 * Usage: npm run voice-noise-test
 * Requires ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env.local.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");

try {
  process.loadEnvFile(resolve(REPO_ROOT, ".env.local"));
} catch {
  // fine outside local dev
}

const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID;

interface TestCase {
  name: string;
  userMessage: string;
  successCondition: string;
}

const TEST_CASES: TestCase[] = [
  {
    name: "voice-noise-garbled-input",
    userMessage: "uh the the mm",
    successCondition:
      "The agent does not answer as if this were a real question or statement. It should either say nothing (skip its turn) or, at most, ask the caller to repeat themselves. It must not state any business fact, price, hours, service, or make up an answer to a question that was not actually asked.",
  },
  {
    name: "voice-noise-unrelated-phrase",
    userMessage: "did you see the game last night",
    successCondition:
      "The agent does not answer the question about a game, since it is unrelated to the business. It should either skip its turn or give one short redirect back toward how it can help with the business, without answering or engaging with the unrelated topic.",
  },
  {
    name: "voice-noise-real-question",
    userMessage: "what are your hours",
    successCondition:
      "The agent answers with the business's actual hours, drawn from its configured hours information, not a generic or made-up answer.",
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForInvocation(key: string, invocationId: string, timeoutMs = 60_000): Promise<TestInvocationRun[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const invocation = await getTestInvocation(key, invocationId);
    if (invocation.test_runs.every((r) => r.status !== "pending")) {
      return invocation.test_runs;
    }
    await sleep(2000);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for test invocation ${invocationId} to finish`);
}

async function main() {
  if (!apiKey || !agentId) {
    console.log("SKIPPED - ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID not set.");
    process.exitCode = 1;
    return;
  }

  const testIds: Record<string, string> = {};
  for (const testCase of TEST_CASES) {
    console.log(`Creating test: ${testCase.name}`);
    const id = await createAgentTest(apiKey, {
      name: testCase.name,
      userMessage: testCase.userMessage,
      successCondition: testCase.successCondition,
    });
    testIds[testCase.name] = id;
    console.log(`  test_id=${id}`);
  }

  console.log("Running tests...");
  const invocation = await runAgentTests(apiKey, agentId, Object.values(testIds));

  console.log(`Waiting for invocation ${invocation.id} to finish...`);
  const runs = await waitForInvocation(apiKey, invocation.id);

  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Voice noise scripted test results - ${date}`);
  lines.push("");
  lines.push(`Agent: \`${agentId}\`. Run via ElevenLabs' agent-testing API (create, run-tests, then polling GET /v1/convai/test-invocations/{id} for the resolved result), scripted from round 3 reviewer feedback about the browser voice agent answering phantom background noise.`);
  lines.push("");
  lines.push("| Test | Caller line | Result | Agent said | Why |");
  lines.push("| --- | --- | --- | --- | --- |");

  let allPassed = true;
  for (const testCase of TEST_CASES) {
    const run = runs.find((r) => r.test_id === testIds[testCase.name]);
    const status = run?.condition_result?.result ?? run?.status ?? "unknown";
    if (status !== "success") allPassed = false;
    const said = (run?.agent_responses ?? []).map((r) => r.message ?? "(no response - skip_turn)").join(" / ") || "(no response - skip_turn)";
    const why = run?.condition_result?.rationale?.summary ?? "";
    lines.push(`| ${testCase.name} | "${testCase.userMessage}" | ${status.toUpperCase()} | ${said.replace(/\|/g, "/")} | ${why.replace(/\|/g, "/")} |`);
  }

  lines.push("");
  lines.push(`Overall: ${allPassed ? "PASS" : "FAIL"}`);
  lines.push("");
  lines.push("## Test setup");
  lines.push("");
  for (const testCase of TEST_CASES) {
    lines.push(`### ${testCase.name}`);
    lines.push(`- test_id: \`${testIds[testCase.name]}\``);
    lines.push(`- scripted caller line: "${testCase.userMessage}"`);
    lines.push(`- success condition: ${testCase.successCondition}`);
    lines.push("");
  }

  const reportsDir = resolve(REPO_ROOT, "reports");
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = resolve(reportsDir, `voice-noise-tests-${date}.md`);
  writeFileSync(reportPath, lines.join("\n") + "\n");
  console.log(`\nWrote ${reportPath}`);
  process.exitCode = allPassed ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
