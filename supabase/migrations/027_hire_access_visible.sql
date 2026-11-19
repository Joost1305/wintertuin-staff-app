-- Mette: everyone with access (helpers too) sees who has access; only the owner changes the list.
drop policy if exists hire_access_select on public.hire_access;
create policy hire_access_select on public.hire_access for select to authenticated using (public.has_hire());
create or replace function public.hire_people() returns table(id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_hire() then raise exception 'Not allowed'; end if;
  return query select p.id, p.full_name, p.email from public.profiles p
    where coalesce(p.active, true) and p.archived_at is null and coalesce(p.email, '') <> 'system-check@wintertuin.app'
    order by p.full_name;
end $$;
