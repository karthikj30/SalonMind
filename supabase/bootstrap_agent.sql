-- Creates the agent-mesh service account (run once, as the postgres role, e.g. in the SQL editor).
-- Use the same email/password as AGENT_BOT_EMAIL / AGENT_BOT_PASSWORD in Vercel.
do $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', 'agents@salonmind.app',
    extensions.crypt('CHANGE-ME', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"SalonMind Agent Mesh"}'::jsonb, now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', 'agents@salonmind.app', 'email_verified', true), 'email', now(), now(), now());
  insert into public.platform_agents(user_id, label) values (uid, 'agent-mesh');
end $$;
