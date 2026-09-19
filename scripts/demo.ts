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
    execFileSync("npx", ["supabase", "start"], { cwd: REPO_ROOT, stdio: "inherit" });
  } catch {
    // Already running - `supabase start` exits non-zero in that case but
    // the stack is still up, so keep going rather than failing the whole
    // script over an idempotent no-op.
  }

  const raw = execFileSync("npx", ["supabase", "status", "-o", "env"], { cwd: REPO_ROOT, encoding: "utf-8" });
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
  return spawn(command, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });
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
    // Demo mode must behave the same whether or not a real .env.local
    // happens to exist alongside it (process.loadEnvFile in
    // with-root-env.ts does not override already-set variables, but it
    // does fill in ones left unset) - blank out every vendor integration
    // explicitly so voice, Twilio, Resend, and media-gate are always off,
    // never silently on because of leftover real credentials on disk.
    ELEVENLABS_API_KEY: "",
    ELEVENLABS_AGENT_ID: "",
    TWILIO_ACCOUNT_SID: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_PHONE_NUMBER_SID: "",
    RESEND_API_KEY: "",
    RESEND_FROM_DOMAIN: "",
    MEDIA_GATE_URL: "",
    MEDIA_GATE_SIGNING_SECRET: "",
    SUPABASE_PROJECT_REF: "",
    SUPABASE_DB_PASSWORD: "",
  };

  console.log("\nStarting the mock LLM gateway (workers/llm-gateway, local, no Cloudflare account)...");
  const gateway = runChild("npx", ["wrangler", "dev", "--port", "8787"], resolve(REPO_ROOT, "workers/llm-gateway"), sharedEnv);

  console.log("Starting the web app (http://localhost:3000)...\n");
  console.log(`Owner dashboard login is created on first "frontdesk provision" - in demo mode, use the viewer login instead:`);
  console.log(`  ${DEMO_VIEWER_EMAIL} / ${DEMO_VIEWER_PASSWORD}`);
  console.log("This account can only read (leads, chats, calls, verify report) - it cannot change anything.");
  console.log("\nVoice (\"Talk to the receptionist\") is disabled in demo mode - it needs a real ElevenLabs agent.");
  console.log("Chat, the dashboard, and `npm run frontdesk -- verify --client demo-plumbing` all work.\n");

  const web = runChild("npm", ["run", "dev", "-w", "apps/web"], REPO_ROOT, sharedEnv);

  const shutdown = () => {
    gateway.kill();
    web.kill();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
