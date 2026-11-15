alter table public.services add column if not exists embedding_model text;
drop function if exists public.match_services(extensions.vector, int);
create or replace function public.match_services(query_embedding extensions.vector(768), p_model text, match_count int default 40)
returns table (service_id uuid, tenant_id uuid, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select s.id, s.tenant_id, 1 - (s.embedding <=> query_embedding) as similarity
  from public.services s join public.tenants t on t.id = s.tenant_id
  where s.active and t.is_published and s.embedding is not null and s.embedding_model = p_model
  order by s.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function public.match_services(extensions.vector, text, int) to anon, authenticated;
