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

/** Secret values under this length are too likely to collide with ordinary code, so only names are checked for them. */
const MIN_VALUE_LENGTH = 8;

export function secretNeedles(names: string[], values: string[]): string[] {
  return [...names, ...values.filter((v) => v.length >= MIN_VALUE_LENGTH)];
}

export function findNeedlesInText(content: string, needles: string[]): string[] {
  return needles.filter((needle) => content.includes(needle));
}

/**
 * Scans a build output directory (e.g. apps/web/.next/static) for
 * server-only env var names and actual secret values, per the build spec's
 * secrets-server-only gate. names are things like "SUPABASE_SERVICE_ROLE_KEY";
 * values are the live secret strings themselves.
 */
export function scanForSecrets(dir: string, names: string[], values: string[]): SecretScanFinding[] {
  const findings: SecretScanFinding[] = [];
  const needles = secretNeedles(names, values);
  if (needles.length === 0) return findings;

  for (const file of listFiles(dir)) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    for (const matched of findNeedlesInText(content, needles)) {
      findings.push({ file, matched });
    }
  }
  return findings;
}
