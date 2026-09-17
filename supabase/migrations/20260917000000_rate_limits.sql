-- Fixed-window rate limit counters, used by apps/web to cap chat messages,
-- voice webhook requests, browser voice sessions, and owner notification
-- emails, so a public demo cannot burn unlimited quota on any vendor.
-- Not tenant-scoped data, so it carries no RLS select policy at all - only
-- the service role (which bypasses RLS) and the increment_rate_limit
-- function below can touch it.

create table rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (scope, key, window_start)
);

create index rate_limits_lookup_idx on rate_limits (scope, key, window_start);

alter table rate_limits enable row level security;

-- Atomic increment-and-read. A single INSERT ... ON CONFLICT statement is
-- one atomic operation in Postgres, so concurrent requests from the same
-- key cannot race each other into undercounting.
create function public.increment_rate_limit(p_scope text, p_key text, p_window_start timestamptz)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into rate_limits (scope, key, window_start, count, updated_at)
  values (p_scope, p_key, p_window_start, 1, now())
  on conflict (scope, key, window_start)
  do update set count = rate_limits.count + 1, updated_at = now()
  returning count;
$$;

revoke all on function public.increment_rate_limit(text, text, timestamptz) from public;
grant execute on function public.increment_rate_limit(text, text, timestamptz) to service_role;

-- Periodic cleanup is left to a manual `delete from rate_limits where
-- window_start < now() - interval '2 days'` - the table stays small at this
-- traffic scale and doesn't need a cron job yet.
