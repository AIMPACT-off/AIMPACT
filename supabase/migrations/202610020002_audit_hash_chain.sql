begin;
alter table public.audit_logs add column if not exists chain_seq bigserial;
create unique index if not exists audit_logs_chain_seq_uidx on public.audit_logs(chain_seq);
create or replace function public.audit_log_hash_chain()
returns trigger language plpgsql as $$
declare prior_hash text;
declare payload jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('aimpact.audit_logs.chain'));
  select event_hash into prior_hash from public.audit_logs order by chain_seq desc limit 1;
  new.previous_hash := coalesce(prior_hash, repeat('0',64));
  payload := jsonb_build_object('chain_seq',new.chain_seq,'id',new.id,'tenant_id',new.tenant_id,'event_type',new.event_type,'actor_id',new.actor_id,'execution_id',new.execution_id,'occurred_at',new.occurred_at,'input_hash',new.input_hash,'output_hash',new.output_hash,'previous_hash',new.previous_hash,'metadata',new.metadata);
  new.event_hash := encode(digest(convert_to(payload::text,'UTF8'),'sha256'),'hex');
  return new;
end; $$;
drop trigger if exists audit_logs_hash_chain on public.audit_logs;
create trigger audit_logs_hash_chain before insert on public.audit_logs for each row execute function public.audit_log_hash_chain();
create or replace function public.verify_audit_log_chain()
returns table(chain_seq bigint, expected_hash text, stored_hash text, valid boolean)
language sql stable as $$
 with ordered as (select a.*,lag(event_hash) over(order by chain_seq) prior from public.audit_logs a),
 calculated as (select chain_seq,event_hash,previous_hash,
 encode(digest(convert_to(jsonb_build_object('chain_seq',chain_seq,'id',id,'tenant_id',tenant_id,'event_type',event_type,'actor_id',actor_id,'execution_id',execution_id,'occurred_at',occurred_at,'input_hash',input_hash,'output_hash',output_hash,'previous_hash',previous_hash,'metadata',metadata)::text,'UTF8'),'sha256'),'hex') calc,
 coalesce(prior,repeat('0',64)) expected_prior from ordered)
 select chain_seq,calc,event_hash,(calc=event_hash and previous_hash=expected_prior) from calculated order by chain_seq;
$$;
revoke all on function public.verify_audit_log_chain() from public,anon,authenticated;
grant execute on function public.verify_audit_log_chain() to service_role;
commit;
