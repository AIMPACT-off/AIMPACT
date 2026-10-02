-- Read-only Production RLS verification. Run with a read-only SQL role.
-- Reports missing relations explicitly; a missing table is NOT treated as secure.
with expected(table_name) as (
  values
    ('tenants'),
    ('tenant_outcomes'),
    ('execution_audit_logs'),
    ('workflow_dispatch_state')
),
resolved as (
  select e.table_name,
         c.oid as relation_oid,
         c.relrowsecurity as rls_enabled,
         c.relforcerowsecurity as force_rls
  from expected e
  left join pg_class c
    on c.oid = to_regclass(format('%I.%I', 'public', e.table_name))
),
policy_counts as (
  select r.table_name, count(p.policyname)::integer as policy_count
  from resolved r
  left join pg_policies p
    on p.schemaname = 'public' and p.tablename = r.table_name
  group by r.table_name
)
select r.table_name,
       (r.relation_oid is not null) as table_exists,
       coalesce(r.rls_enabled, false) as rls_enabled,
       coalesce(r.force_rls, false) as force_rls,
       pc.policy_count,
       case
         when r.relation_oid is null then 'MISSING_TABLE'
         when not r.rls_enabled then 'RLS_DISABLED'
         when pc.policy_count = 0 then 'RLS_ON_BUT_NO_POLICIES'
         else 'RLS_ENABLED_POLICIES_PRESENT_REVIEW_REQUIRED'
       end as verification_status
from resolved r
join policy_counts pc using (table_name)
order by r.table_name;

-- Important:
-- 1. This proves catalog flags/policy presence only, not that policy predicates
--    correctly enforce tenant isolation.
-- 2. Review pg_policies.qual and with_check for each table.
-- 3. Follow with the tenant A / tenant B negative-access test using non-service
--    role JWTs. Never run tenant-isolation tests with service_role credentials.
