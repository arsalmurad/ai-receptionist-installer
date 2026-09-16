import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client for the dashboard login form. Uses the anon key only -
 * every read after login is scoped by RLS to the signed-in user's tenant.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
