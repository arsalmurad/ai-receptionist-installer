import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { targetConfigSchema } from "@frontdesk-kit/config";
import { runPortableChecks } from "../lib/portableChecks";
import { printGateTable, writeMarkdownReport, overallStatus } from "../lib/report";

interface CheckOptions {
  target: string;
  json?: boolean;
}

/**
 * Runs only the "portable" gates - the ones that need a live URL plus
 * whichever vendor credentials are available, not this repo's internals -
 * against any AI receptionist install described by a target config file.
 * See README "Check any install" and packages/cli/src/lib/portableChecks.ts.
 */
export async function checkCommand(options: CheckOptions): Promise<void> {
  const path = resolve(process.cwd(), options.target);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    console.error(`Could not read/parse target config at ${path}: ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const parsed = targetConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`Invalid target config at ${path}:`);
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const target = parsed.data;
  console.log(`Checking "${target.name}" at ${target.baseUrl}\n`);

  const results = await runPortableChecks(target);

  printGateTable(results);
  const status = overallStatus(results);
  const reportPath = writeMarkdownReport(target.name, results, target.baseUrl);
  console.log(`\nOverall: ${status.toUpperCase()}`);
  console.log(`Report written to ${reportPath}`);

  if (options.json) {
    console.log(JSON.stringify({ target: target.name, url: target.baseUrl, status, results }, null, 2));
  }

  if (status === "fail") process.exitCode = 1;
}
