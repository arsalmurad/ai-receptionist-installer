import { createServerSupabaseClient } from "@/lib/supabase/server";

interface InstallCheckResult {
  gate: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  reason: string;
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();

  // No tenant_id filters below - RLS on every table scopes these to the
  // rows the signed-in user's tenant membership allows. See
  // supabase/migrations/20260916120000_core_schema.sql.
  const [leads, chatSessions, callLogs, latestCheck] = await Promise.all([
    supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("chat_sessions").select("id, created_at, ended_at").order("created_at", { ascending: false }).limit(20),
    supabase.from("call_logs").select("*").order("created_at", { ascending: false }).limit(20),
    supabase.from("install_checks").select("*").order("run_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const check = latestCheck.data;
  const results: InstallCheckResult[] = (check?.results as InstallCheckResult[] | undefined) ?? [];

  return (
    <div>
      <section className="card">
        <h2>Latest install report</h2>
        {check ? (
          <>
            <p>
              <span className="badge">{check.overall_status.toUpperCase()}</span>{" "}
              <span className="muted">{new Date(check.run_at).toLocaleString()}</span>
            </p>
            <table>
              <tbody>
                {results.map((r) => (
                  <tr key={r.gate}>
                    <td>{r.gate}</td>
                    <td>{r.status}</td>
                    <td className="muted">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="muted">No verify run yet. Run: npm run frontdesk -- verify --client &lt;id&gt;</p>
        )}
      </section>

      <section className="card">
        <h2>Leads ({leads.data?.length ?? 0})</h2>
        <table>
          <thead>
            <tr><th>Source</th><th>Message</th><th>Status</th><th>When</th></tr>
          </thead>
          <tbody>
            {leads.data?.map((l) => (
              <tr key={l.id}>
                <td>{l.source}</td>
                <td>{l.message ?? l.name ?? l.phone ?? l.email}</td>
                <td>{l.status}</td>
                <td className="muted">{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Chat sessions ({chatSessions.data?.length ?? 0})</h2>
        <table>
          <thead><tr><th>Started</th><th>Ended</th></tr></thead>
          <tbody>
            {chatSessions.data?.map((s) => (
              <tr key={s.id}>
                <td>{new Date(s.created_at).toLocaleString()}</td>
                <td className="muted">{s.ended_at ? new Date(s.ended_at).toLocaleString() : "in progress"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Call logs ({callLogs.data?.length ?? 0})</h2>
        <table>
          <thead><tr><th>From</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            {callLogs.data?.map((c) => (
              <tr key={c.id}>
                <td>{c.from_number ?? "unknown"}</td>
                <td>{c.status}</td>
                <td className="muted">{new Date(c.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
