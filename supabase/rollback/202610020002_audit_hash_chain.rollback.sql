-- LOCAL/DISPOSABLE DATABASE ONLY. Never run as an automatic production rollback.
begin;
drop function if exists public.verify_audit_log_chain();
drop trigger if exists audit_logs_hash_chain on public.audit_logs;
drop function if exists public.audit_log_hash_chain();
drop index if exists public.audit_logs_chain_seq_uidx;
alter table public.audit_logs drop column if exists chain_seq;
commit;
