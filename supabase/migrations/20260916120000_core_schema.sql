-- Core multi-tenant schema. Every tenant-scoped table has tenant_id and RLS.
-- auth.uid() calls in policies are wrapped in (select auth.uid()) so Postgres
-- treats them as an InitPlan evaluated once per query instead of once per
-- row - see docs/DESIGN_NOTES.md (RLS InitPlan finding).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  business_name text not null,
  created_at timestamptz not null default now()
);

alter table tenants enable row level security;

-- ---------------------------------------------------------------------------
-- tenant_members
-- ---------------------------------------------------------------------------
create table tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index tenant_members_tenant_id_idx on tenant_members (tenant_id);
create index tenant_members_user_id_idx on tenant_members (user_id);

alter table tenant_members enable row level security;

-- Direct, non-recursive policy: a user can see their own membership rows.
create policy "members can view own membership rows"
  on tenant_members for select
  using ((select auth.uid()) = user_id);

-- security definer helper so other tables' policies can check membership
-- without re-triggering RLS recursion on tenant_members.
create function public.is_tenant_member(check_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from tenant_members
    where tenant_id = check_tenant_id
      and user_id = (select auth.uid())
  );
$$;

create policy "members can view their tenant"
  on tenants for select
  using (public.is_tenant_member(id));

-- ---------------------------------------------------------------------------
-- consents
-- ---------------------------------------------------------------------------
create table consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel text not null check (channel in ('chat', 'voice')),
  disclosure_version text not null,
  caller_identifier text,
  accepted_at timestamptz not null default now()
);

create index consents_tenant_id_idx on consents (tenant_id);

alter table consents enable row level security;

create policy "members can view their tenant consents"
  on consents for select
  using (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source text not null check (source in ('chat', 'voice')),
  name text,
  phone text,
  email text,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

create index leads_tenant_id_idx on leads (tenant_id);
create index leads_created_at_idx on leads (tenant_id, created_at desc);

alter table leads enable row level security;

create policy "members can view their tenant leads"
  on leads for select
  using (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- chat_sessions
-- ---------------------------------------------------------------------------
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  consent_id uuid references consents(id),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create index chat_sessions_tenant_id_idx on chat_sessions (tenant_id);

alter table chat_sessions enable row level security;

create policy "members can view their tenant chat sessions"
  on chat_sessions for select
  using (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_tenant_id_idx on chat_messages (tenant_id);
create index chat_messages_session_id_idx on chat_messages (session_id, created_at);

alter table chat_messages enable row level security;

create policy "members can view their tenant chat messages"
  on chat_messages for select
  using (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- call_logs
-- ---------------------------------------------------------------------------
create table call_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  call_sid text not null,
  from_number text,
  to_number text,
  status text not null default 'in-progress',
  consent_id uuid references consents(id),
  lead_id uuid references leads(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, call_sid)
);

create index call_logs_tenant_id_idx on call_logs (tenant_id);
create index call_logs_created_at_idx on call_logs (tenant_id, created_at desc);

alter table call_logs enable row level security;

create policy "members can view their tenant call logs"
  on call_logs for select
  using (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- install_checks
-- ---------------------------------------------------------------------------
create table install_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  run_at timestamptz not null default now(),
  overall_status text not null check (overall_status in ('pass', 'fail')),
  results jsonb not null,
  report_path text,
  created_at timestamptz not null default now()
);

create index install_checks_tenant_id_idx on install_checks (tenant_id);
create index install_checks_run_at_idx on install_checks (tenant_id, run_at desc);

alter table install_checks enable row level security;

create policy "members can view their tenant install checks"
  on install_checks for select
  using (public.is_tenant_member(tenant_id));

-- No insert/update/delete policies are defined for the authenticated role on
-- any table above. All writes go through server routes using the service
-- role key, which bypasses RLS entirely. Members get read-only access to
-- their own tenant's rows and nothing else.
