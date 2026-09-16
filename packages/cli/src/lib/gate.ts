import type { GateResult, GateStatus } from "./report";

export class Skip extends Error {}
export class Fail extends Error {}

export async function runGate(name: string, fn: () => Promise<string | void>): Promise<GateResult> {
  try {
    const okMessage = await fn();
    return { gate: name, status: "PASS", reason: okMessage || "ok" };
  } catch (error) {
    if (error instanceof Skip) {
      return { gate: name, status: "SKIPPED", reason: error.message };
    }
    const status: GateStatus = "FAIL";
    return { gate: name, status, reason: error instanceof Error ? error.message : String(error) };
  }
}
