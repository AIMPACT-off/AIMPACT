-- Mirror of the migration applied to the connected AIMPACT Supabase project.
-- Pin search_path for audit trigger and verifier functions to avoid mutable-path resolution.
alter function public.reject_audit_log_mutation() set search_path = public, pg_temp;
alter function public.audit_log_hash_chain() set search_path = public, pg_temp;
alter function public.verify_audit_log_chain() set search_path = public, pg_temp;
