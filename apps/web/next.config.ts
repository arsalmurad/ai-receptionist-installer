import type { NextConfig } from "next";
import { loadAppEnv } from "@frontdesk-kit/config";

// Fails the build immediately, listing every missing/invalid required var at
// once, instead of failing later with an opaque runtime error. Optional
// integration vars (Twilio, ElevenLabs, Resend) are not required here - see
// packages/config/src/env.ts.
loadAppEnv();

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
