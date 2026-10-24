-- Mirror of the migration applied to the connected AIMPACT Supabase project.
-- idx_leads_created_at duplicated leads_created_at_idx exactly.
drop index if exists public.idx_leads_created_at;
