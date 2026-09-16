import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Per-request server client bound to the signed-in user's session cookies.
 * Uses the anon key, so every query goes through RLS - the dashboard never
 * needs to filter by tenant_id itself, Postgres does it.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component - safe to ignore because
            // middleware.ts refreshes the session on every request.
          }
        },
      },
    },
  );
}
