import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/dashboard/login");
}
