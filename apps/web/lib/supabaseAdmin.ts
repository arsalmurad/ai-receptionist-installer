import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

let client: SupabaseClient | undefined;

/**
 * Service-role Supabase client. Server-only - never imported from a client
 * component. Bypasses RLS entirely, so every query here must already be
 * scoped to the right tenant_id by the caller.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    const env = getEnv();
    client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
