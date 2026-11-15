-- Growth features found in market research (Zenoti, Fresha, MioSalon, Dingg, Zylu, OpenSalon):
-- staff leave / blocked time, automated waitlist, memberships, prepaid wallet, loyalty & referrals,
-- birthdays, Google review link. Every table is tenant-scoped with RLS.

alter table public.clients
  add column if not exists birthday date,
  add column if not exists wallet_balance numeric not null default 0,
  add column if not exists loyalty_points int not null default 0,
  add column if not exists referred_by uuid references public.clients(id) on delete set null;

alter table public.tenants add column if not exists google_review_url text;

alter table public.bookings
  add column if not exists rescheduled_from timestamptz,
  add column if not exists is_historical boolean not null default false;

create table public.staff_time_off (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index staff_time_off_tenant on public.staff_time_off(tenant_id, start_at);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  date date,
  from_time time,
  to_time time,
  status text not null default 'waiting' check (status in ('waiting','offered','booked','expired')),
  offered_slot timestamptz,
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now()
);
create index waitlist_tenant_status on public.waitlist(tenant_id, status);

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  price numeric not null,
  discount_pct numeric not null default 0 check (discount_pct between 0 and 100),
  validity_days int not null default 365,
  wallet_credit numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.client_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_id uuid not null references public.membership_plans(id) on delete cascade,
  starts_at date not null default current_date,
  ends_at date not null,
  created_at timestamptz not null default now()
);
create index client_memberships_client on public.client_memberships(client_id, ends_at);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('topup','spend','membership_credit','loyalty_earn','loyalty_redeem','referral_bonus','adjust')),
  amount numeric not null default 0,
  points int not null default 0,
  ref uuid,
  note text,
  created_at timestamptz not null default now()
);
create index wallet_tx_client on public.wallet_transactions(client_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['staff_time_off','waitlist','membership_plans','client_memberships','wallet_transactions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy tenant_isolation on public.%I for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id))', t);
  end loop;
end $$;

-- new tenant settings defaults (existing tenants get them via app-side DEFAULT_SETTINGS merge)
alter table public.tenants alter column settings set default '{
  "surge_cap_pct": 25, "flash_discount_cap_pct": 20,
  "reorder_buffer_days": 3, "nudge_threshold": 0.3, "deposit_threshold": 0.55,
  "deposit_pct": 25, "retention_grace_days": 7, "gst_rate": 18,
  "default_language": "en", "loyalty_points_per_100": 1, "loyalty_max_redeem_pct": 50,
  "referral_bonus_points": 200
}'::jsonb;
