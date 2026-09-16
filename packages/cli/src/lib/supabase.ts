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

function randomPassword(): string {
  const bytes = Array.from({ length: 18 }, () => Math.floor(Math.random() * 36).toString(36));
  return `Fk-${bytes.join("")}-1!`;
}

export type EnsureOwnerAccountResult =
  | { status: "created"; password: string }
  | { status: "already-exists" }
  | { status: "failed"; reason: string };

/**
 * Ensures the tenant has a dashboard login for its owner, so
 * `frontdesk provision` leaves a client with something they can actually
 * sign into - not just data with no way to view it. Idempotent: does
 * nothing if a tenant_members row already exists for this tenant.
 */
export async function ensureOwnerAccount(tenantId: string, email: string): Promise<EnsureOwnerAccountResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { status: "failed", reason: "Supabase admin client not configured" };

  const { data: existingMember } = await supabase
    .from("tenant_members")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (existingMember) return { status: "already-exists" };

  const password = randomPassword();
  const { data: user, error: userError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (userError || !user.user) {
    // The auth user may already exist from a previous run that failed after
    // creating it but before the membership row - look it up and link it.
    const { data: page } = await supabase.auth.admin.listUsers();
    const existingUser = page?.users.find((u) => u.email === email);
    if (!existingUser) {
      return { status: "failed", reason: userError?.message ?? "could not create or find user" };
    }
    await supabase.from("tenant_members").insert({ tenant_id: tenantId, user_id: existingUser.id, role: "owner" });
    return { status: "already-exists" };
  }

  await supabase.from("tenant_members").insert({ tenant_id: tenantId, user_id: user.user.id, role: "owner" });
  return { status: "created", password };
}
