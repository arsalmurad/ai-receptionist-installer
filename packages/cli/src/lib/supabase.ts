import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

export function getSupabaseAdmin(): SupabaseClient | undefined {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return undefined;
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function getSupabaseAnon(): SupabaseClient | undefined {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return undefined;
  return createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function getOrCreateTenant(clientId: string, businessName: string): Promise<string | undefined> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return undefined;

  const { data: existing } = await supabase.from("tenants").select("id").eq("client_id", clientId).maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from("tenants")
    .insert({ client_id: clientId, business_name: businessName })
    .select("id")
    .single();

  if (error || !created) return undefined;
  return created.id as string;
}
