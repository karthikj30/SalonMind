-- Supabase advisor: helper SECURITY DEFINER functions should not be callable by anon.
revoke execute on function public.has_tenant_access(uuid) from public, anon;
revoke execute on function public.is_platform_agent() from public, anon;
revoke execute on function public.match_services(extensions.vector, text, int) from public, anon;
grant execute on function public.has_tenant_access(uuid) to authenticated;
grant execute on function public.is_platform_agent() to authenticated;
grant execute on function public.match_services(extensions.vector, text, int) to authenticated;
