import { readFileSync } from "node:fs";
import { clientConfigSchema } from "@frontdesk-kit/config";
import { clientExists, readClientConfig, writeClientConfig } from "../lib/clientConfig";
import { clientConfigPath } from "../lib/paths";

export function initCommand(clientId: string): void {
  if (clientExists(clientId)) {
    console.log(`clients/${clientId} already exists. Validating existing config instead of overwriting.`);
    try {
      readClientConfig(clientId);
      console.log(`OK - clients/${clientId}/config.json is valid.`);
    } catch (error) {
      console.error((error as Error).message);
      process.exitCode = 1;
    }
    return;
  }

  console.log(`Scaffolding clients/${clientId} from clients/_template ...`);
  const templateRaw = JSON.parse(readFileSync(clientConfigPath("_template"), "utf-8"));
  const template = clientConfigSchema.parse(templateRaw);

  const config = {
    ...template,
    clientId,
    businessName: `${clientId} (edit businessName in config.json)`,
  };

  writeClientConfig(clientId, config);
  console.log(`Wrote clients/${clientId}/config.json.`);
  console.log("Edit it, then run: npm run frontdesk -- verify --client " + clientId);
}
