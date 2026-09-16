import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";

const SCANNABLE_EXT = new Set([".js", ".mjs", ".cjs", ".css", ".map", ".txt", ".json"]);

function listFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listFiles(full));
    } else if (SCANNABLE_EXT.has(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

export interface SecretScanFinding {
  file: string;
  matched: string;
}

/**
 * Scans a build output directory (e.g. apps/web/.next/static) for
 * server-only env var names and actual secret values, per the build spec's
 * secrets-server-only gate. names are things like "SUPABASE_SERVICE_ROLE_KEY";
 * values are the live secret strings themselves.
 */
export function scanForSecrets(dir: string, names: string[], values: string[]): SecretScanFinding[] {
  const findings: SecretScanFinding[] = [];
  const needles = [...names, ...values.filter((v) => v.length >= 8)];
  if (needles.length === 0) return findings;

  for (const file of listFiles(dir)) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    for (const needle of needles) {
      if (content.includes(needle)) {
        findings.push({ file, matched: needle });
      }
    }
  }
  return findings;
}
