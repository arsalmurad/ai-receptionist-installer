-- Seeds the demo tenant used by clients/demo-plumbing. Idempotent: re-running
-- this migration (or frontdesk provision) does not create a duplicate row.
insert into tenants (client_id, business_name)
values ('demo-plumbing', 'Demo Plumbing Co')
on conflict (client_id) do nothing;
