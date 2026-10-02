SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants',
    'tenant_outcomes',
    'execution_audit_logs',
    'workflow_dispatch_state'
  )
ORDER BY tablename;

-- Expected: every returned target table has rowsecurity = true.
