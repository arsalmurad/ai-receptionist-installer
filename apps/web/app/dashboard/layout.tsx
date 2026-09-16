import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/dashboard/login");
  }

  return (
    <div className="page">
      <nav style={{ marginBottom: "1.5rem", display: "flex", justifyContent: "space-between" }}>
        <strong>Dashboard</strong>
        <form action="/dashboard/sign-out" method="post">
          <button className="button" type="submit">
            Sign out
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
