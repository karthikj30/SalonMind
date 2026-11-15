-- SOC 2 / ISO 27001 evidence: append-only audit trail of every change to sensitive tables.
-- Records WHO (user / platform agent / system), WHAT table + operation, WHICH row and WHICH columns
-- changed — never the values themselves (DPDP data-minimisation).
create table public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,               -- no FK: entries must survive the cascade that deletes their rows
  actor uuid,
  actor_type text not null,
  table_name text not null,
  op text not null,
  row_id uuid,
  changed_fields text[],
  at timestamptz not null default now()
);
create index audit_log_tenant_at on public.audit_log(tenant_id, at desc);
alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated using (public.has_tenant_access(tenant_id));
-- no insert/update/delete policies: only the trigger (security definer) can write; nobody can edit history
revoke insert, update, delete on public.audit_log from anon, authenticated;

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into changed
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key not in ('updated_at', 'embedding');
    if changed is null then return null; end if;
  end if;
  insert into public.audit_log(tenant_id, actor, actor_type, table_name, op, row_id, changed_fields)
  values (
    case when tg_table_name = 'tenants' then (r->>'id')::uuid else (r->>'tenant_id')::uuid end,
    auth.uid(),
    case when auth.uid() is null then 'system' when public.is_platform_agent() then 'agent' else 'user' end,
    tg_table_name, lower(tg_op), (r->>'id')::uuid, changed
  );
  return null;
end $$;
revoke all on function public.audit_trigger() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['tenants','clients','staff','services','invoices','payroll_runs','purchase_orders','membership_plans',
                           'client_memberships','wallet_transactions','staff_adjustments','candidates','deals']
  loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- owner self-deletion (DPDP) also removes that salon's audit trail
create or replace function public.delete_my_account() returns int
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); n int; owned uuid[];
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if public.is_platform_agent() then raise exception 'service accounts cannot be deleted this way'; end if;
  select array_agg(m.tenant_id) into owned from public.tenant_members m
  where m.user_id = uid and m.role = 'owner'
    and not exists (select 1 from public.tenant_members o where o.tenant_id = m.tenant_id and o.role = 'owner' and o.user_id <> uid);
  delete from public.tenants where id = any(coalesce(owned, '{}'));
  get diagnostics n = row_count;
  delete from public.audit_log where tenant_id = any(coalesce(owned, '{}'));
  delete from auth.users where id = uid;
  return n;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
