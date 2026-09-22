import { spawn, execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

/**
 * `npm run demo` - starts the whole app against a local Supabase instance
 * (via the Supabase CLI, which needs Docker running), the mock LLM
 * provider, and seeded demo data. No external accounts, no .env.local
 * needed. Voice features stay off (they need a real ElevenLabs agent) -
 * everything else works. See README "Local development".
 */

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "..");

const DEMO_VIEWER_EMAIL = "viewer@demo.local";
const DEMO_VIEWER_PASSWORD = "ViewOnly-Demo-2026!";
const LOCAL_GATEWAY_SECRET = "local-dev-shared-secret-do-not-use-in-prod";
const LOCAL_VERIFY_TOKEN = "local-dev-verify-token-not-a-real-secret";

// npx/npm on Windows are .cmd shims, not .exe files. Spawning a .cmd
// directly (even by its full name) fails with EINVAL without a shell - a
// known Node/Windows quirk - so shell: true is required here, unlike for
// docker.exe. Node warns this is unsafe with an args array (unescaped
// concatenation); safe in practice since every argument below is a static
// string this script controls, never external input.
const NPX = "npx";
const NPM = "npm";
const SHELL = process.platform === "win32";

interface SupabaseStatus {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}

function checkDockerRunning(): void {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
  } catch {
    console.error("Docker does not appear to be running. `npm run demo` needs Docker for local Supabase.");
    console.error("Start Docker Desktop (or your Docker daemon) and try again.");
    process.exit(1);
  }
}

function startSupabase(): SupabaseStatus {
  console.log("Starting local Supabase (first run pulls Docker images - can take a few minutes)...");
  try {
    execFileSync(NPX, ["supabase", "start"], { cwd: REPO_ROOT, stdio: "inherit", shell: SHELL });
  } catch {
    // A non-zero exit here has two very different causes: "already
    // running" (harmless - the stack is still up) or a genuine startup
    // failure, e.g. a slow first boot's health checks timing out (which
    // also tears the containers back down). The status call below is what
    // actually tells the two apart, so this alone must not be fatal.
  }

  let raw: string;
  try {
    raw = execFileSync(NPX, ["supabase", "status", "-o", "env"], { cwd: REPO_ROOT, encoding: "utf-8", shell: SHELL });
  } catch (error) {
    console.error("\nLocal Supabase did not come up. This can happen on a slow first boot - Docker health checks");
    console.error("timing out under load, especially right after starting Docker Desktop. Try `npm run demo` again;");
    console.error("if it keeps happening, run `npx supabase start` directly to see the full error.");
    console.error((error as Error).message);
    process.exit(1);
  }
  const values: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (match) values[match[1]] = match[2];
  }
  if (!values.API_URL || !values.ANON_KEY || !values.SERVICE_ROLE_KEY) {
    console.error("Could not read Supabase local connection info from `supabase status -o env`. Raw output:");
    console.error(raw);
    process.exit(1);
  }
  return { API_URL: values.API_URL, ANON_KEY: values.ANON_KEY, SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY };
}

async function ensureViewerAccount(status: SupabaseStatus): Promise<void> {
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: tenant } = await admin.from("tenants").select("id").eq("client_id", "demo-plumbing").maybeSingle();
  if (!tenant) {
    console.error('No "demo-plumbing" tenant found - migrations/seed did not run as expected.');
    return;
  }

  const { data: existingUsers } = await admin.auth.admin.listUsers();
  let viewerId = existingUsers?.users.find((u) => u.email === DEMO_VIEWER_EMAIL)?.id;

  if (!viewerId) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email: DEMO_VIEWER_EMAIL,
      password: DEMO_VIEWER_PASSWORD,
      email_confirm: true,
    });
    if (error || !created.user) {
      console.error(`Could not create viewer account: ${error?.message}`);
      return;
    }
    viewerId = created.user.id;
  }

  const { data: membership } = await admin
    .from("tenant_members")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", viewerId)
    .maybeSingle();

  if (!membership) {
    await admin.from("tenant_members").insert({ tenant_id: tenant.id, user_id: viewerId, role: "viewer" });
  }
}

function runChild(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ReturnType<typeof spawn> {
  return spawn(command, args, { cwd, env, stdio: "inherit", shell: SHELL });
}

async function main() {
  checkDockerRunning();
  const status = startSupabase();
  await ensureViewerAccount(status);

  const sharedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CLIENT_ID: "demo-plumbing",
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    LLM_GATEWAY_URL: "http://127.0.0.1:8787",
    LLM_GATEWAY_SHARED_SECRET: LOCAL_GATEWAY_SECRET,
    VERIFY_TOKEN: LOCAL_VERIFY_TOKEN,
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    // Required by the app's env schema (packages/config/src/env.ts) even
    // though nothing at runtime actually reads it - only the CLI's
    // `supabase db push` step does, which demo mode never calls. A
    // placeholder satisfies validation without claiming a real project.
    SUPABASE_PROJECT_REF: "local-demo",
    // Demo mode must behave the same whether or not a real .env.local
    // happens to exist alongside it. with-root-env.ts's
    // process.loadEnvFile() never overrides a variable that is already
    // set - including set to an empty string - but it DOES fill in one
    // that is genuinely absent from the child's env. So these must be set
    // to "" here, not deleted, or a real .env.local would silently turn
    // them back on. Boolean("") is false, same as Boolean(undefined), so
    // computeFeatureFlags() still reports every one of these off.
    ELEVENLABS_API_KEY: "",
    ELEVENLABS_AGENT_ID: "",
    TWILIO_ACCOUNT_SID: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_PHONE_NUMBER_SID: "",
    RESEND_API_KEY: "",
    RESEND_FROM_DOMAIN: "",
  };

  // MEDIA_GATE_URL and MEDIA_GATE_SIGNING_SECRET can't follow the same "set
  // to empty string" approach above - they have their own format
  // validators (.url(), .min(16)) that reject an empty string even though
  // the field itself is optional, so they must be genuinely deleted
  // instead. That reopens the loadEnvFile gap described above for these
  // two specifically: if a real .env.local sets them, media-gate could end
  // up "on" in demo mode. Accepted as a known, low-impact gap - media-gate
  // has no UI wired to it yet (see README), so this cannot change what a
  // demo mode user actually sees or does.
  delete sharedEnv.MEDIA_GATE_URL;
  delete sharedEnv.MEDIA_GATE_SIGNING_SECRET;
  delete sharedEnv.SUPABASE_DB_PASSWORD;

  console.log("\nStarting the mock LLM gateway (workers/llm-gateway, local, no Cloudflare account)...");
  const gateway = runChild(NPX, ["wrangler", "dev", "--port", "8787"], resolve(REPO_ROOT, "workers/llm-gateway"), sharedEnv);

  console.log("Starting the web app (http://localhost:3000)...\n");
  console.log(`Owner dashboard login is created on first "frontdesk provision" - in demo mode, use the viewer login instead:`);
  console.log(`  ${DEMO_VIEWER_EMAIL} / ${DEMO_VIEWER_PASSWORD}`);
  console.log("This account can only read (leads, chats, calls, verify report) - it cannot change anything.");
  console.log("\nVoice (\"Talk to the receptionist\") is disabled in demo mode - it needs a real ElevenLabs agent.");
  console.log("Chat, the dashboard, and `npm run frontdesk -- verify --client demo-plumbing` all work.\n");

  const web = runChild(NPM, ["run", "dev", "-w", "apps/web"], REPO_ROOT, sharedEnv);

  const shutdown = () => {
    gateway.kill();
    web.kill();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
