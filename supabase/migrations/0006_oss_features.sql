-- Features ported from open-source projects (see docs/RESEARCH.md):
--   Kontor        → DB-enforced double-booking prevention, two-phase AI booking proposals, human handoff
--   upi-pg        → salon UPI VPA for upi://pay deposit / bill links + QR
--   india-payroll → PF / ESI / professional-tax flags per staff
--   easyappointments → per-stylist calendar (ICS) feed token

create extension if not exists btree_gist with schema extensions;

-- A stylist / room can never hold two live bookings at once — enforced by Postgres even under festival-rush concurrency.
alter table public.bookings add constraint bookings_no_staff_overlap
  exclude using gist (staff_id with =, tstzrange(start_at, end_at) with &&)
  where (staff_id is not null and status in ('booked', 'confirmed'));
alter table public.bookings add constraint bookings_no_room_overlap
  exclude using gist (room_id with =, tstzrange(start_at, end_at) with &&)
  where (room_id is not null and status in ('booked', 'confirmed'));

alter table public.tenants add column if not exists upi_vpa text;

alter table public.staff
  add column if not exists gender text check (gender in ('female', 'male', 'other')),
  add column if not exists pf_enabled boolean not null default true,
  add column if not exists esi_enabled boolean not null default true,
  add column if not exists calendar_token text not null default encode(extensions.gen_random_bytes(16), 'hex');
create unique index if not exists staff_calendar_token on public.staff(calendar_token);

-- AI-initiated bookings are proposals with frozen arguments until the customer explicitly confirms.
create table public.booking_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  contact_handle text not null,
  service_id uuid not null references public.services(id) on delete cascade,
  date date not null,
  time time not null,
  quoted_price numeric not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired', 'superseded', 'failed')),
  booking_id uuid references public.bookings(id) on delete set null,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now()
);
create index booking_proposals_handle on public.booking_proposals(tenant_id, contact_handle, status);

-- Per-conversation control: AI handles it, or a human has taken over (escalation).
create table public.conversations (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact_handle text not null,
  status text not null default 'ai' check (status in ('ai', 'human')),
  reason text,
  unclear_count int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, contact_handle)
);

do $$
declare t text;
begin
  foreach t in array array['booking_proposals', 'conversations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy tenant_isolation on public.%I for all to authenticated using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id))', t);
  end loop;
end $$;
