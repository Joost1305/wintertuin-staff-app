-- Delete an account (managers only, never your own).
-- No history: the account is removed for good (login and profile).
-- With history that must stay (HACCP records, clock times, shifts): the account is archived instead.
--   It can no longer log in, it disappears from all lists, and the records keep the name.
alter table public.profiles add column if not exists archived_at timestamptz;

create or replace function public.delete_account(target uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Only managers can delete accounts'; end if;
  if target = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  begin
    delete from public.profiles where id = target;
    delete from auth.users where id = target;
    return 'deleted';
  exception when foreign_key_violation then
    -- this block's deletes are rolled back; keep the history, close the account
    update public.profiles set active = false, archived_at = now() where id = target;
    update auth.users set banned_until = 'infinity' where id = target;
    return 'archived';
  end;
end $$;

revoke all on function public.delete_account(uuid) from public, anon;
grant execute on function public.delete_account(uuid) to authenticated;
