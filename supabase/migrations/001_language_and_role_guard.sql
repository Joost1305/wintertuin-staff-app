-- Staff app: per-user language (English by default)
alter table public.profiles add column if not exists language text not null default 'en' check (language in ('en','nl'));

-- Everyone may update their own profile (name, language), but only managers may change role, active or email.
-- Before this, a staff member could make themselves manager.
create or replace function public.profiles_guard_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_manager()
     and (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email) then
    raise exception 'Only a manager can change role, active or email';
  end if;
  return new;
end $$;
revoke execute on function public.profiles_guard_role() from public, anon, authenticated;
create trigger profiles_guard_role before update on public.profiles
  for each row execute function public.profiles_guard_role();
