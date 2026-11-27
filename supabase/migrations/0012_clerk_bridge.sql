-- Clerk email-code sign-in (src/app/auth/clerk/route.ts).
-- Clerk proves the person owns the email address; the server, as the platform agent service account,
-- then makes sure a Supabase user exists for that email and sets the password the server derives for it,
-- so the session that RLS checks (auth.uid()) stays a normal Supabase session. Existing owners keep
-- their user id, memberships and salons. Agent service accounts can never be signed into this way.

create or replace function public.clerk_bridge_user(p_email text, p_password text, p_name text)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid;
begin
  if not public.is_platform_agent() then raise exception 'forbidden'; end if;
  if length(coalesce(p_password, '')) < 32 then raise exception 'password too short'; end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    return public.provision_user(lower(p_email), p_password, coalesce(nullif(trim(p_name), ''), split_part(p_email, '@', 1)));
  end if;
  if exists (select 1 from public.platform_agents where user_id = uid) then raise exception 'not allowed'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = uid
     and (encrypted_password is null or encrypted_password <> extensions.crypt(p_password, encrypted_password));
  return uid;
end $$;
revoke all on function public.clerk_bridge_user from public, anon;
grant execute on function public.clerk_bridge_user to authenticated;
