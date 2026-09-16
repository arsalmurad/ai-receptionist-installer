import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseClientConfig } from "@frontdesk-kit/config";

// Runs before `next dev`/`next build`. Copies clients/<CLIENT_ID>/config.json
// into apps/web/lib/client-config.generated.json (gitignored) as a real
// static file, so Next's build output file tracing picks it up without any
// extra tracing config, and validates it against the schema before the app
// ever starts.

const here = dirname(fileURLToPath(import.meta.url));
const clientId = process.env.CLIENT_ID;

if (!clientId) {
  console.error("CLIENT_ID is not set. Set it in .env.local or the deployment environment.");
  process.exit(1);
}

const sourcePath = resolve(here, "../../../clients", clientId, "config.json");
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(sourcePath, "utf-8"));
} catch (error) {
  console.error(`Could not read client config at ${sourcePath}: ${(error as Error).message}`);
  process.exit(1);
}

const config = parseClientConfig(clientId, raw);

const outDir = resolve(here, "../lib");
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "client-config.generated.json"), JSON.stringify(config, null, 2));

console.log(`Generated client config for "${clientId}" from ${sourcePath}`);
