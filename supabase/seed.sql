-- Seed data for local/demo use only. Supabase CLI runs this automatically
-- after migrations on `supabase start` / `supabase db reset` - see
-- scripts/demo.ts and README "Local development: npm run demo". Never runs
-- against a real deployment (frontdesk provision never calls db reset).

do $$
declare
  v_tenant_id uuid;
  v_consent_id uuid;
  v_session_id uuid;
begin
  select id into v_tenant_id from tenants where client_id = 'demo-plumbing';
  if v_tenant_id is null then
    raise notice 'demo-plumbing tenant not found - migration 20260916120100 should have created it';
    return;
  end if;

  insert into consents (tenant_id, channel, disclosure_version, caller_identifier)
  values (v_tenant_id, 'chat', 'v1', 'seed-visitor')
  returning id into v_consent_id;

  insert into chat_sessions (tenant_id, consent_id, created_at, ended_at)
  values (v_tenant_id, v_consent_id, now() - interval '2 hours', now() - interval '2 hours' + interval '4 minutes')
  returning id into v_session_id;

  insert into chat_messages (tenant_id, session_id, role, content, created_at) values
    (v_tenant_id, v_session_id, 'user', 'Do you offer free estimates?', now() - interval '2 hours'),
    (v_tenant_id, v_session_id, 'assistant', 'Yes, estimates for non-emergency work are free and are given on site before work starts.', now() - interval '2 hours' + interval '10 seconds');

  insert into leads (tenant_id, source, name, phone, message, status, created_at) values
    (v_tenant_id, 'chat', 'Jordan Lee', '555-0142', 'Asked about exact pricing for a water heater replacement, took contact details.', 'new', now() - interval '1 day'),
    (v_tenant_id, 'voice', 'Sam Rivera', '555-0198', 'Called about a burst pipe, emergency slot offered.', 'contacted', now() - interval '3 days');

  insert into call_logs (tenant_id, call_sid, from_number, to_number, status, consent_id, created_at, updated_at) values
    (v_tenant_id, 'CAseed00000000000000000000000001', '+15550001111', '+15550002222', 'completed', v_consent_id, now() - interval '3 days', now() - interval '3 days');

  insert into install_checks (tenant_id, overall_status, results, report_path, run_at) values
    (v_tenant_id, 'pass',
     '[{"gate":"1 typecheck+build","status":"PASS","reason":"typecheck and build both exited 0"},{"gate":"2 pages 200","status":"PASS","reason":"/, /dashboard/login all returned 200"},{"gate":"3 consent gate","status":"PASS","reason":"403 without consent, 200 with consent"}]'::jsonb,
     'reports/demo-seed.md', now() - interval '1 hour');
end $$;
