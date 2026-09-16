import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPORTS_DIR } from "./paths";

export type GateStatus = "PASS" | "FAIL" | "SKIPPED";

export interface GateResult {
  gate: string;
  status: GateStatus;
  reason: string;
}

export function overallStatus(results: GateResult[]): "pass" | "fail" {
  return results.some((r) => r.status === "FAIL") ? "fail" : "pass";
}

export function printGateTable(results: GateResult[]): void {
  const gateWidth = Math.max(4, ...results.map((r) => r.gate.length));
  const statusWidth = 7;
  console.log(`${"GATE".padEnd(gateWidth)}  ${"STATUS".padEnd(statusWidth)}  REASON`);
  console.log(`${"-".repeat(gateWidth)}  ${"-".repeat(statusWidth)}  ${"-".repeat(40)}`);
  for (const r of results) {
    console.log(`${r.gate.padEnd(gateWidth)}  ${r.status.padEnd(statusWidth)}  ${r.reason}`);
  }
}

export function writeMarkdownReport(clientId: string, results: GateResult[], url: string | undefined): string {
  mkdirSync(REPORTS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const path = resolve(REPORTS_DIR, `${clientId}-${date}.md`);
  const status = overallStatus(results);

  const rows = results
    .map((r) => `| ${r.gate} | ${r.status} | ${r.reason.replace(/\|/g, "\\|")} |`)
    .join("\n");

  const content = [
    `# Install report: ${clientId}`,
    "",
    `Run at: ${new Date().toISOString()}`,
    url ? `Target URL: ${url}` : "Target: local",
    `Overall: ${status.toUpperCase()}`,
    "",
    "| Gate | Status | Reason |",
    "| --- | --- | --- |",
    rows,
    "",
  ].join("\n");

  writeFileSync(path, content);
  return path;
}
