import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// apps/web has its own package.json (so `npm run dev` has a natural cwd of
// apps/web) but the single .env.local lives at the repo root, shared with
// the CLI. Next.js's automatic .env loading only looks in its own cwd, so
// this loads the root file into process.env first, then re-runs the given
// compound command in a child shell that inherits it. In CI/Vercel there is
// no .env.local - real env vars are injected directly - so a missing file
// here is not an error.

const here = dirname(fileURLToPath(import.meta.url));
const rootEnvPath = resolve(here, "../../../.env.local");

try {
  process.loadEnvFile(rootEnvPath);
} catch {
  // no .env.local present - expected in CI/Vercel
}

const command = process.argv.slice(2).join(" ");
if (!command) {
  console.error("with-root-env: no command given");
  process.exit(1);
}

const result = spawnSync(command, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
