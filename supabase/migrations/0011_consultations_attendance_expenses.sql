-- Client consultation cards (colour formulas + patch tests), staff attendance that feeds payroll, and an expense
-- book for the monthly profit & loss. Sources: docs/RESEARCH.md sweep 4.

-- Colour formula card: exactly what was mixed, so any stylist can repeat the result.
create table public.client_formulas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  staff_id uuid references public.staff(id) on delete set null,
  formula text not null,
  developer text,
  processing_min int check (processing_min between 0 and 240),
  notes text,
  created_at timestamptz not null default now()
);
create index client_formulas_client on public.client_formulas(tenant_id, client_id, created_at desc);
alter table public.client_formulas enable row level security;
create policy tenant_isolation on public.client_formulas for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

-- Allergy alert (patch / skin) tests: required at least 48 h before colour services, repeated every 12 months.
create table public.patch_tests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  product text not null,
  tested_on date not null,
  result text not null default 'pending' check (result in ('pending', 'pass', 'fail')),
  staff_id uuid references public.staff(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index patch_tests_client on public.patch_tests(tenant_id, client_id, tested_on desc);
alter table public.patch_tests enable row level security;
create policy tenant_isolation on public.patch_tests for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

-- Clock-in / clock-out. One row per stylist per day; payroll counts days present.
create table public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  work_date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  source text not null default 'desk' check (source in ('desk', 'voice', 'manual')),
  created_at timestamptz not null default now(),
  unique (staff_id, work_date),
  check (clock_out is null or clock_out >= clock_in)
);
create index staff_attendance_period on public.staff_attendance(tenant_id, work_date);
alter table public.staff_attendance enable row level security;
create policy tenant_isolation on public.staff_attendance for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

-- Expense book (rent, electricity, supplies …) for the profit & loss report. gst_paid feeds input-tax notes.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  spent_on date not null,
  category text not null check (category in ('rent', 'utilities', 'supplies', 'marketing', 'maintenance', 'salaries', 'software', 'other')),
  amount numeric not null check (amount > 0),
  gst_paid numeric not null default 0 check (gst_paid >= 0),
  paid_via text not null default 'upi',
  note text,
  created_at timestamptz not null default now()
);
create index expenses_period on public.expenses(tenant_id, spent_on);
alter table public.expenses enable row level security;
create policy tenant_isolation on public.expenses for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));

-- Money and pay-relevant rows join the append-only audit trail (migration 0007).
do $$ declare t text; begin
  foreach t in array array['gift_cards','client_packages','staff_attendance','expenses','patch_tests'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t);
  end loop;
end $$;
