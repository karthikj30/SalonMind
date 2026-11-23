-- Gift cards, prepaid service packages and the customer "manage my booking" link.
-- Gift cards are payment vouchers: no GST when sold, GST is charged on the service when the card is redeemed.
-- Packages are prepaid services: GST is invoiced at sale, each visit then consumes one session at ₹0.
create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  amount numeric not null check (amount > 0),
  balance numeric not null check (balance >= 0),
  buyer_name text,
  buyer_phone text,
  recipient_name text,
  recipient_phone text,
  message text,
  payment_method text,
  expires_at date not null,
  status text not null default 'active' check (status in ('active', 'redeemed', 'expired', 'void')),
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create index gift_cards_tenant on public.gift_cards(tenant_id, status, expires_at);
alter table public.gift_cards enable row level security;
create policy tenant_isolation on public.gift_cards for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create table public.package_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  service_id uuid not null references public.services(id) on delete cascade,
  sessions int not null check (sessions between 1 and 100),
  price numeric not null check (price >= 0),
  validity_days int not null default 180 check (validity_days > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.package_plans enable row level security;
create policy tenant_isolation on public.package_plans for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

create table public.client_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  plan_id uuid not null references public.package_plans(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  sessions_total int not null,
  sessions_left int not null check (sessions_left >= 0),
  expires_at date not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now()
);
create index client_packages_lookup on public.client_packages(tenant_id, client_id, service_id, expires_at);
alter table public.client_packages enable row level security;
create policy tenant_isolation on public.client_packages for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

-- Unguessable per-booking token for the customer's self-service link (/b/<token>).
alter table public.bookings add column manage_token uuid not null default gen_random_uuid();
create unique index bookings_manage_token on public.bookings(manage_token);
