-- DPDP Act right to erasure for salon owners: delete the caller's account and every salon they solely own.
create or replace function public.delete_my_account() returns int
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if public.is_platform_agent() then raise exception 'service accounts cannot be deleted this way'; end if;
  with owned as (
    select m.tenant_id from public.tenant_members m
    where m.user_id = uid and m.role = 'owner'
      and not exists (select 1 from public.tenant_members o where o.tenant_id = m.tenant_id and o.role = 'owner' and o.user_id <> uid)
  ), del as (delete from public.tenants t using owned where t.id = owned.tenant_id returning 1)
  select count(*) into n from del;
  delete from auth.users where id = uid;
  return n;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
