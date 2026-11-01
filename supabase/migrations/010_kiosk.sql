-- Clock-in tablet (kiosk): a tablet signed in as a manager shows the team; people tap their name and type a 4-digit PIN.
-- PINs are stored hashed in their own table that nobody can read directly; only the functions below touch it.
-- After 5 wrong PINs a person is locked for 5 minutes.

create table if not exists public.kiosk_pins (
  staff_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash text not null,
  fails int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.kiosk_pins enable row level security;
-- no policies on purpose: the table is only reached through the security definer functions below

-- Everyone sets or changes their own PIN
create or replace function public.set_my_kiosk_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'The PIN is 4 digits.'; end if;
  insert into kiosk_pins (staff_id, pin_hash) values (auth.uid(), crypt(p_pin, gen_salt('bf')))
  on conflict (staff_id) do update set pin_hash = excluded.pin_hash, fails = 0, locked_until = null, updated_at = now();
end $$;

create or replace function public.has_kiosk_pin()
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from kiosk_pins where staff_id = auth.uid())
$$;

-- The tablet: who is in the team, who has a PIN, who is clocked in now (managers only)
create or replace function public.kiosk_people()
returns table (id uuid, full_name text, has_pin boolean, checked_in_at timestamptz, section text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Only a manager can open the clock-in tablet.'; end if;
  return query
    select p.id, p.full_name,
      exists (select 1 from kiosk_pins k where k.staff_id = p.id),
      (select c.check_in_at from checkins c where c.staff_id = p.id and c.check_out_at is null order by c.check_in_at desc limit 1),
      (select s.section from shifts s where s.staff_id = p.id and s.shift_date = (now() at time zone 'Europe/Amsterdam')::date order by s.start_time limit 1)
    from profiles p
    where coalesce(p.active, true) and coalesce(p.email, '') <> 'system-check@wintertuin.app'
    order by p.sort_order nulls last, p.full_name;
end $$;

-- Clock in or out for a person, after their PIN (managers' tablet only)
create or replace function public.kiosk_clock(p_staff uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k record; open_id uuid; open_at timestamptz; nm text;
begin
  if not public.is_manager() then raise exception 'Only a manager can open the clock-in tablet.'; end if;
  select * into k from kiosk_pins where staff_id = p_staff for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_pin'); end if;
  if k.locked_until is not null and k.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'until', k.locked_until);
  end if;
  if k.pin_hash <> crypt(p_pin, k.pin_hash) then
    update kiosk_pins set
      locked_until = case when fails + 1 >= 5 then now() + interval '5 minutes' else null end,
      fails = case when fails + 1 >= 5 then 0 else fails + 1 end
    where staff_id = p_staff;
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;
  update kiosk_pins set fails = 0, locked_until = null where staff_id = p_staff;
  select full_name into nm from profiles where id = p_staff;
  select id, check_in_at into open_id, open_at from checkins where staff_id = p_staff and check_out_at is null order by check_in_at desc limit 1;
  if open_id is not null then
    update checkins set check_out_at = now() where id = open_id;
    return jsonb_build_object('ok', true, 'action', 'out', 'name', nm, 'since', open_at, 'at', now());
  end if;
  insert into checkins (staff_id, check_in_at) values (p_staff, now());
  return jsonb_build_object('ok', true, 'action', 'in', 'name', nm, 'at', now());
end $$;

-- Leaving the tablet mode asks for the PIN of the manager who is signed in on it
create or replace function public.check_my_kiosk_pin(p_pin text)
returns boolean language sql security definer set search_path = public, extensions as $$
  select coalesce((select pin_hash = crypt(p_pin, pin_hash) from kiosk_pins where staff_id = auth.uid()), false)
$$;

revoke all on function public.set_my_kiosk_pin(text), public.has_kiosk_pin(), public.kiosk_people(), public.kiosk_clock(uuid, text), public.check_my_kiosk_pin(text) from public, anon;
grant execute on function public.set_my_kiosk_pin(text), public.has_kiosk_pin(), public.kiosk_people(), public.kiosk_clock(uuid, text), public.check_my_kiosk_pin(text) to authenticated;
