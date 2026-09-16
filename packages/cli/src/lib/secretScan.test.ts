import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { scanForSecrets } from "./secretScan";

describe("scanForSecrets", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(resolve(tmpdir(), "frontdesk-secret-scan-"));
    writeFileSync(resolve(dir, "clean.js"), "console.log('hello world')");
    writeFileSync(resolve(dir, "leaky.js"), "const key = 'sk_live_super_secret_value_123';");
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("finds nothing in a clean bundle", () => {
    const findings = scanForSecrets(dir, ["SUPABASE_SERVICE_ROLE_KEY"], []);
    expect(findings.filter((f) => f.file.endsWith("clean.js"))).toHaveLength(0);
  });

  it("finds a leaked secret value", () => {
    const findings = scanForSecrets(dir, ["SUPABASE_SERVICE_ROLE_KEY"], ["sk_live_super_secret_value_123"]);
    expect(findings.some((f) => f.file.endsWith("leaky.js"))).toBe(true);
  });

  it("finds a leaked var name even without knowing the value", () => {
    writeFileSync(resolve(dir, "name-leak.js"), "// SUPABASE_SERVICE_ROLE_KEY debug output");
    const findings = scanForSecrets(dir, ["SUPABASE_SERVICE_ROLE_KEY"], []);
    expect(findings.some((f) => f.file.endsWith("name-leak.js"))).toBe(true);
  });
});
