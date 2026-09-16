import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseClientConfig, type ClientConfig } from "@frontdesk-kit/config";
import { clientConfigPath, clientDir } from "./paths";

export function clientExists(clientId: string): boolean {
  return existsSync(clientConfigPath(clientId));
}

export function readClientConfig(clientId: string): ClientConfig {
  const raw = JSON.parse(readFileSync(clientConfigPath(clientId), "utf-8"));
  return parseClientConfig(clientId, raw);
}

export function writeClientConfig(clientId: string, config: ClientConfig): void {
  mkdirSync(clientDir(clientId), { recursive: true });
  writeFileSync(clientConfigPath(clientId), JSON.stringify(config, null, 2) + "\n");
}
