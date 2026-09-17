-- Adds "viewer" as a valid tenant_members role, for read-only demo access.
-- No RLS policy differentiates by role today - every table only has SELECT
-- policies for members, and all writes go through the service role from
-- server routes, never from an authenticated user's own session. So a
-- "viewer" account is already read-only in practice through both the
-- dashboard UI (no write actions exist) and the database (no INSERT/UPDATE/
-- DELETE policy exists for the authenticated role on any table). This
-- migration only extends the constraint so the role can be labeled
-- accurately instead of overloading "staff" for something with different
-- intent.
alter table tenant_members drop constraint tenant_members_role_check;
alter table tenant_members add constraint tenant_members_role_check
  check (role in ('owner', 'staff', 'viewer'));
