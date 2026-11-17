-- Walk-in token queue (high-footfall Indian salons): customers join at the desk or by scanning a QR code,
-- get a token and a live wait estimate; "Call next" turns the token into a normal booking via the scheduler.
create table public.walkins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  queue_date date not null,
  token_no int not null,
  name text not null,
  phone text,
  service_id uuid references public.services(id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'serving', 'done', 'left')),
  source text not null default 'desk' check (source in ('desk', 'qr')),
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  called_at timestamptz,
  unique (tenant_id, queue_date, token_no)
);
create index walkins_queue on public.walkins(tenant_id, queue_date, status);
alter table public.walkins enable row level security;
-- names and phone numbers: salon staff and the platform agents only. The public queue page is rendered
-- server-side and shows token numbers and wait times, never who is waiting.
create policy tenant_isolation on public.walkins for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
