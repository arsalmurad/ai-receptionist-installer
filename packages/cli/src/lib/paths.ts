import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, "../../../..");
export const CLIENTS_DIR = resolve(REPO_ROOT, "clients");
export const REPORTS_DIR = resolve(REPO_ROOT, "reports");

export function clientDir(clientId: string): string {
  return resolve(CLIENTS_DIR, clientId);
}

export function clientConfigPath(clientId: string): string {
  return resolve(clientDir(clientId), "config.json");
}
