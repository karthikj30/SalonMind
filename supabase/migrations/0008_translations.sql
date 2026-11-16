-- Translation memory: the Translator agent stores each salon's catalogue (service names/descriptions,
-- salon description, deal titles) in Indian languages once, so public pages never call a translation
-- API while rendering. Keyed by the md5 of the source text, so an edited text is simply re-translated.
-- is_public = catalogue text (readable by consumers of a published salon); private rows cache inbox
-- translations for the salon's own staff only.
create table public.translations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lang text not null,
  source_hash text not null,
  source_text text not null,
  text text not null,
  provider text not null,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, lang, source_hash)
);
create index translations_lookup on public.translations(tenant_id, lang);
alter table public.translations enable row level security;
create policy tenant_isolation on public.translations for all to authenticated
  using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
-- consumers may read only the public catalogue translations of published salons
create policy translations_public_read on public.translations for select to anon, authenticated
  using (is_public and exists (select 1 from public.tenants t where t.id = tenant_id and t.is_published));
