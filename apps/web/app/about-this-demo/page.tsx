import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { getTenantId } from "@/lib/tenant";

const REPO_URL = "https://github.com/arsalmurad/ai-receptionist-installer";
const RUNBOOK_URL = `${REPO_URL}/blob/main/docs/RUNBOOK.md`;

interface InstallCheckResult {
  gate: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  reason: string;
}

export const metadata = {
  title: "About this demo",
};

// Always reads the latest install_checks row at request time - a build-time
// static render would freeze the "latest verify report" at whatever the
// database held when this page was last built, not what it actually is now.
export const dynamic = "force-dynamic";

export default async function AboutThisDemoPage() {
  const tenantId = await getTenantId();
  const supabase = getSupabaseAdmin();

  const { data: check } = await supabase
    .from("install_checks")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("run_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const results: InstallCheckResult[] = (check?.results as InstallCheckResult[] | undefined) ?? [];

  return (
    <main className="page">
      <h1>About this demo</h1>

      <section className="card">
        <h2>What this is</h2>
        <p>
          ai-receptionist-installer is a toolkit that sets up an AI chat assistant and phone receptionist for
          a small business, then runs 12 automated checks that prove the install is safe and working.
        </p>
      </section>

      <section className="card">
        <h2>What you&apos;re looking at</h2>
        <p>
          This website is not the product. It is the site the installer set up for a made-up plumbing
          company, so you can see what an install looks like and try it.
        </p>
      </section>

      <section className="card">
        <h2>Three things to try</h2>
        <ul>
          <li>
            <strong>Ask the chat a question about hours or services.</strong> It answers from this
            business&apos;s own configuration, not a general-purpose model with no boundaries.
          </li>
          <li>
            <strong>Ask the chat a price it doesn&apos;t list.</strong> It won&apos;t guess. It takes your
            details instead so someone can follow up, showing the tool refusing to improvise a fact it
            doesn&apos;t have.
          </li>
          <li>
            <strong>Talk to the receptionist in your browser.</strong> This is the same AI agent a phone
            caller would reach, reachable without a phone call.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Latest verify report</h2>
        {check ? (
          <>
            <p>
              <span className="badge">{check.overall_status.toUpperCase()}</span>{" "}
              <span className="muted">{new Date(check.run_at).toLocaleString()}</span>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Gate</th>
                  <th>Status</th>
                  <th>Reason</th>
                </tr>
              </thead>
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
          <p className="muted">No verify run recorded yet.</p>
        )}
      </section>

      <section className="card">
        <h2>Learn more</h2>
        <ul>
          <li>
            <Link href={REPO_URL}>GitHub repo</Link>
          </li>
          <li>
            <Link href={RUNBOOK_URL}>Runbook</Link>
          </li>
        </ul>
      </section>
    </main>
  );
}
