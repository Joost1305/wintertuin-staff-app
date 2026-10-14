-- Order of people in the roster (managers drag them up and down)
alter table public.profiles add column if not exists sort_order integer not null default 0;

create or replace function public.profiles_guard_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_manager()
     and (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email
          or new.sort_order is distinct from old.sort_order) then
    raise exception 'Only a manager can change role, active, email or order';
  end if;
  return new;
end $$;

-- Open or close one day from the team app roster. Allowed for team app managers and finance managers.
-- When the choice matches the regular opening hours and there is no note, the exception is removed.
create or replace function public.fin_set_day_open(p_day date, p_open boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_rest uuid; v_regular boolean; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select id into v_rest from fin_restaurants order by created_at limit 1;
  if v_rest is null then raise exception 'No restaurant'; end if;
  if not (public.is_manager() or public.fin_rank(v_rest) >= 2) then raise exception 'Not allowed'; end if;
  select coalesce(oh.is_open, false) into v_regular from fin_opening_hours oh
    where oh.restaurant_id = v_rest and oh.season = fin_season(p_day) and oh.weekday = extract(isodow from p_day)::int;
  if coalesce(v_regular, false) = p_open and v_note is null then
    delete from fin_closures where restaurant_id = v_rest and day = p_day;
  else
    insert into fin_closures (restaurant_id, day, is_open, note) values (v_rest, p_day, p_open, v_note)
    on conflict (restaurant_id, day) do update set is_open = excluded.is_open, note = excluded.note;
  end if;
end $$;
revoke execute on function public.fin_set_day_open(date, boolean, text) from public, anon;
grant execute on function public.fin_set_day_open(date, boolean, text) to authenticated;
