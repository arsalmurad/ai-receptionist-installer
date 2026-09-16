import { computeFeatureFlags, loadAppEnv } from "@frontdesk-kit/config";

let cached: ReturnType<typeof loadAppEnv> | undefined;

export function getEnv() {
  if (!cached) {
    cached = loadAppEnv();
  }
  return cached;
}

export function getFeatureFlags() {
  return computeFeatureFlags(getEnv());
}
