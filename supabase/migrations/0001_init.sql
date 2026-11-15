-- SalonMind — AI-native multi-tenant salon ERP + marketplace
-- Postgres (Supabase free tier) + pgvector. Tenant isolation via Row Level Security.

create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── Tenancy ─────────────────────────
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  city text,
  state text,
  state_code text,              -- GST state code, e.g. 27 = Maharashtra
  gstin text,
  address text,
  phone text,
  description text,
  is_published boolean not null default true,  -- visible in consumer marketplace
  open_time time not null default '10:00',
  close_time time not null default '20:00',
  settings jsonb not null default '{
    "surge_cap_pct": 25, "flash_discount_cap_pct": 20,
    "reorder_buffer_days": 3, "nudge_threshold": 0.3, "deposit_threshold": 0.55,
    "deposit_pct": 25, "retention_grace_days": 7, "gst_rate": 18,
    "default_language": "en"
  }'::jsonb,
  ui_layout jsonb,               -- AI-generated dashboard micro-frontend schema
  created_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','manager','staff')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- Service accounts used by autonomous agents (cron / marketplace) — cross-tenant access.
create table public.platform_agents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text
);

create or replace function public.is_platform_agent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_agents where user_id = auth.uid());
$$;

create or replace function public.has_tenant_access(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_platform_agent()
      or exists (select 1 from public.tenant_members m where m.tenant_id = tid and m.user_id = auth.uid());
$$;

-- ───────────────────────── Operations ─────────────────────────
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  role text not null default 'stylist',
  phone text,
  skill_level int not null default 3 check (skill_level between 1 and 5),
  skills text[] not null default '{}',
  employment_type text not null default 'employee' check (employment_type in ('employee','booth_renter')),
  booth_rent_pct numeric not null default 0,      -- % of revenue retained by salon for booth renters
  base_salary numeric not null default 0,
  commission_slabs jsonb not null default '[{"upto":50000,"pct":10},{"upto":150000,"pct":15},{"upto":null,"pct":20}]'::jsonb,
  product_commission_pct numeric not null default 5,
  hourly_cost numeric not null default 200,
  work_start time not null default '10:00',
  work_end time not null default '20:00',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  type text not null default 'chair',
  equipment text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  gstin text,
  state_code text,
  price_tiers jsonb not null default '[{"min_qty":10,"discount_pct":5},{"min_qty":50,"discount_pct":10}]'::jsonb,
  flexibility numeric not null default 0.5 check (flexibility between 0 and 1), -- learned negotiation behaviour
  rating numeric not null default 4,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  name text not null,
  brand text,
  unit text not null default 'ml',
  stock_qty numeric not null default 0,
  reorder_level numeric not null default 0,
  unit_cost numeric not null default 0,
  retail_price numeric not null default 0,
  gst_rate numeric not null default 18,
  hsn text default '3305',
  lead_time_days int not null default 3,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  category text not null default 'hair',
  description text,
  duration_min int not null default 45,
  base_price numeric not null,
  min_skill_level int not null default 1,
  required_equipment text[] not null default '{}',
  sac text not null default '999721',
  embedding extensions.vector(768),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.service_products (
  service_id uuid not null references public.services(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  qty_per_service numeric not null,
  primary key (service_id, product_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  language text not null default 'en',
  state_code text,
  notes text,
  consent_marketing boolean not null default true,   -- DPDP consent
  churn_risk numeric,
  avg_cycle_days numeric,
  last_visit_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index clients_tenant_phone on public.clients(tenant_id, phone) where phone is not null;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  staff_id uuid references public.staff(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked','confirmed','completed','no_show','cancelled')),
  base_price numeric not null default 0,
  price numeric not null default 0,
  pricing_note text,
  deposit_required numeric not null default 0,
  deposit_paid numeric not null default 0,
  no_show_risk numeric,
  source text not null default 'walkin',
  rating int check (rating between 1 and 5),
  review text,
  review_sentiment numeric,
  schedule_reasoning text,
  created_at timestamptz not null default now()
);
create index bookings_tenant_start on public.bookings(tenant_id, start_at);

create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  staff_id uuid references public.staff(id) on delete set null,
  expected_qty numeric not null default 0,
  actual_qty numeric not null default 0,
  source text not null default 'auto' check (source in ('auto','scale','manual')),
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','negotiating','approved','received','cancelled')),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  gst_amount numeric not null default 0,
  total numeric not null default 0,
  is_interstate boolean not null default false,
  ai_reasoning text,
  created_by text not null default 'human',
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.negotiations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_id uuid references public.purchase_orders(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  messages jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  original_total numeric,
  negotiated_total numeric,
  created_at timestamptz not null default now()
);

-- ───────────────────────── CRM / comms ─────────────────────────
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  contact_handle text,
  channel text not null check (channel in ('whatsapp','sms','instagram','google','call','web','email')),
  direction text not null check (direction in ('in','out')),
  body text not null,
  status text not null default 'simulated',
  agent text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index messages_tenant_created on public.messages(tenant_id, created_at desc);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  type text not null,
  message text not null,
  channel text not null default 'whatsapp',
  status text not null default 'sent',
  created_at timestamptz not null default now()
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid references public.services(id) on delete cascade,
  title text not null,
  description text,
  kind text not null default 'flash' check (kind in ('flash','offpeak','last_minute','festival','manual')),
  discount_pct numeric not null,
  slot_start timestamptz,
  valid_to timestamptz not null,
  active boolean not null default true,
  created_by text not null default 'human',
  created_at timestamptz not null default now()
);

-- ───────────────────────── HR ─────────────────────────
create table public.job_postings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  role text not null default 'stylist',
  description text,
  location text,
  salary_range text,
  ad_copy jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_id uuid references public.job_postings(id) on delete set null,
  name text not null,
  phone text,
  email text,
  source text default 'manual',
  resume_text text,
  score numeric,
  summary text,
  status text not null default 'new' check (status in ('new','screening','shortlisted','rejected','hired')),
  screening_chat jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  lines jsonb not null,
  total numeric not null,
  created_at timestamptz not null default now()
);

create table public.staff_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  kind text not null check (kind in ('tip','penalty','bonus')),
  amount numeric not null,
  note text,
  created_at timestamptz not null default now()
);

create table public.learning_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  module text not null,
  reason text,
  status text not null default 'assigned',
  created_at timestamptz not null default now()
);

-- ───────────────────────── Billing / GST ─────────────────────────
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  number text not null,
  invoice_date date not null default current_date,
  place_of_supply text,
  items jsonb not null,
  taxable_value numeric not null,
  cgst numeric not null default 0,
  sgst numeric not null default 0,
  igst numeric not null default 0,
  total numeric not null,
  payment_method text,
  payment_status text not null default 'paid',
  splits jsonb,
  irn text,          -- e-invoice reference (hash) — real IRP integration requires GSP credentials
  created_at timestamptz not null default now(),
  unique (tenant_id, number)
);

create table public.gst_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period text not null,
  gstr1 jsonb,
  gstr3b jsonb,
  itc jsonb,
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, period)
);

-- ───────────────────────── Agent mesh ─────────────────────────
create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'system',
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index agent_events_pending on public.agent_events(status, created_at);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  agent text not null,
  trigger text not null,
  summary text,
  actions jsonb not null default '[]'::jsonb,
  output jsonb,
  provider text,
  status text not null default 'ok',
  duration_ms int,
  created_at timestamptz not null default now()
);
create index agent_runs_tenant_created on public.agent_runs(tenant_id, created_at desc);

-- ───────────────────────── RLS ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['staff','rooms','vendors','products','services','service_products','clients','bookings',
    'usage_logs','purchase_orders','negotiations','messages','campaigns','deals','job_postings','candidates',
    'payroll_runs','staff_adjustments','learning_assignments','invoices','gst_returns','agent_events','agent_runs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy tenant_isolation on public.%I for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id))', t);
  end loop;
end $$;

alter table public.tenants enable row level security;
create policy tenants_member on public.tenants for all to authenticated
  using (public.has_tenant_access(id)) with check (public.has_tenant_access(id));
create policy tenants_public_read on public.tenants for select to anon, authenticated using (is_published);

alter table public.tenant_members enable row level security;
create policy members_self on public.tenant_members for select to authenticated
  using (user_id = auth.uid() or public.is_platform_agent());

alter table public.platform_agents enable row level security;
create policy platform_agents_self on public.platform_agents for select to authenticated using (user_id = auth.uid());

-- Public marketplace reads (consumers do not log in)
create policy services_public_read on public.services for select to anon, authenticated
  using (active and exists (select 1 from public.tenants t where t.id = tenant_id and t.is_published));
create policy deals_public_read on public.deals for select to anon, authenticated
  using (active and valid_to > now() and exists (select 1 from public.tenants t where t.id = tenant_id and t.is_published));

-- ───────────────────────── RPCs ─────────────────────────
-- Create a salon and make the caller its owner (atomic).
create or replace function public.create_tenant(p_name text, p_slug text, p_city text, p_state text, p_state_code text,
  p_gstin text, p_address text, p_phone text, p_description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.tenants(name, slug, city, state, state_code, gstin, address, phone, description)
  values (p_name, p_slug, p_city, p_state, p_state_code, p_gstin, p_address, p_phone, p_description)
  returning id into tid;
  insert into public.tenant_members(tenant_id, user_id, role) values (tid, auth.uid(), 'owner');
  return tid;
end $$;
revoke all on function public.create_tenant from public, anon;
grant execute on function public.create_tenant to authenticated;

-- Account provisioning (email pre-confirmed). Only platform agents may call it — the
-- Next.js /api/auth/signup route calls it using the agent service account.
create or replace function public.provision_user(p_email text, p_password text, p_name text)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := gen_random_uuid();
begin
  if not public.is_platform_agent() then raise exception 'forbidden'; end if;
  if exists (select 1 from auth.users where lower(email) = lower(p_email)) then raise exception 'email already registered'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', lower(p_email),
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', p_name), now(), now(),
    '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', lower(p_email), 'email_verified', true), 'email', now(), now(), now());
  return uid;
end $$;
revoke all on function public.provision_user from public, anon;
grant execute on function public.provision_user to authenticated;

-- Vector similarity search over services of published salons
create or replace function public.match_services(query_embedding extensions.vector(768), match_count int default 30)
returns table (service_id uuid, tenant_id uuid, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select s.id, s.tenant_id, 1 - (s.embedding <=> query_embedding) as similarity
  from public.services s join public.tenants t on t.id = s.tenant_id
  where s.active and t.is_published and s.embedding is not null
  order by s.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function public.match_services to anon, authenticated;
