import { getSupabaseAdmin } from "./supabaseAdmin";
import { getEnv } from "./env";

let cachedTenantId: string | undefined;

/**
 * Resolves the single tenant this deployment serves (CLIENT_ID -> tenants.id).
 * Cached in-process; a Supabase edge function/instance restart clears it.
 */
export async function getTenantId(): Promise<string> {
  if (cachedTenantId) return cachedTenantId;

  const env = getEnv();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("client_id", env.CLIENT_ID)
    .single();

  if (error || !data) {
    throw new Error(`No tenant row for CLIENT_ID="${env.CLIENT_ID}". Run frontdesk provision first.`);
  }

  cachedTenantId = data.id as string;
  return cachedTenantId;
}
