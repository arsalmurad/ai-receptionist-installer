import { resolve } from "node:path";
import { REPO_ROOT } from "./paths";

let loaded = false;

/**
 * Loads the repo-root .env.local into process.env, once per process. Safe
 * to call from every command. No .env.local (CI, real deployment) is not
 * an error - real env vars are already injected there.
 */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;
  try {
    process.loadEnvFile(resolve(REPO_ROOT, ".env.local"));
  } catch {
    // no .env.local present - fine outside local dev
  }
}

export function env(name: string): string | undefined {
  loadRootEnv();
  return process.env[name];
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`${name} is required but not set`);
  }
  return value;
}
