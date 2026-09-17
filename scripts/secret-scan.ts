import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * CI secret scan. Two checks:
 *  1. .env.local (or any .env* file) must never be tracked by git.
 *  2. If a local .env.local exists, none of its values may appear verbatim
 *     in any git-tracked file (catches accidental hardcoding/copy-paste).
 * This is deliberately narrow - packages/cli's `verify` gate 8 does the
 * deeper check of the actual Next.js client bundle.
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf-8" });
  return out.split("\n").filter(Boolean);
}

function main() {
  const files = trackedFiles();
  let failed = false;

  const trackedEnvFiles = files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example"));
  if (trackedEnvFiles.length > 0) {
    console.error(`FAIL: .env file(s) are tracked by git: ${trackedEnvFiles.join(", ")}`);
    failed = true;
  } else {
    console.log("OK: no .env files are tracked by git.");
  }

  const SENSITIVE_KEY_PATTERN = /(KEY|SECRET|TOKEN|PASSWORD)/i;

  const envLocalPath = resolve(REPO_ROOT, ".env.local");
  if (existsSync(envLocalPath)) {
    const lines = readFileSync(envLocalPath, "utf-8").split("\n");
    const values = lines
      .filter((line) => {
        const key = (line.split("=")[0] ?? "").replace(/\r$/, "");
        return SENSITIVE_KEY_PATTERN.test(key);
      })
      .map((line) => line.split("=").slice(1).join("=").trim())
      .filter((v) => v.length >= 8);

    for (const file of files) {
      if (file === ".env.local" || file.endsWith(".env.local")) continue;
      let content: string;
      try {
        content = readFileSync(resolve(REPO_ROOT, file), "utf-8");
      } catch {
        continue; // binary or unreadable - skip
      }
      for (const value of values) {
        if (content.includes(value)) {
          console.error(`FAIL: a value from .env.local appears verbatim in tracked file ${file}`);
          failed = true;
        }
      }
    }
    if (!failed) console.log("OK: no .env.local values found in tracked files.");
  } else {
    console.log("No local .env.local to check against (expected in CI).");
  }

  process.exitCode = failed ? 1 : 0;
}

main();
