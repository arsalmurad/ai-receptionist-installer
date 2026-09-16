import { clientConfigSchema, type ClientConfig } from "@frontdesk-kit/config";
import generated from "./client-config.generated.json";

export const clientConfig: ClientConfig = clientConfigSchema.parse(generated);
