import type { NextConfig } from "next";
import { loadAppEnv } from "@frontdesk-kit/config";

// Fails the build immediately, listing every missing/invalid required var at
// once, instead of failing later with an opaque runtime error. Optional
// integration vars (Twilio, ElevenLabs, Resend) are not required here - see
// packages/config/src/env.ts.
loadAppEnv(process.env);

const nextConfig: NextConfig = {
  agentRules: false,
};

export default nextConfig;
