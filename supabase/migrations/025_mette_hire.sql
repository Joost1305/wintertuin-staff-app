-- Mette: the finance part for the room hire of Mette te Velde (all rooms of the venue except the restaurant).
-- Her own rooms, bookings (per daypart or per day), costs and settings, with a dashboard in the app (#/mette).
-- Completely separate from the restaurant and from Wintertuin Finance: only people in hire_access see anything,
-- and only the owner (Mette) decides who else gets access. Being a manager in the Team app is not enough.

create table if not exists public.hire_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'helper' check (role in ('owner', 'helper')),
  created_at timestamptz not null default now()
);

create or replace function public.hire_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.hire_access where user_id = auth.uid()
$$;
create or replace function public.has_hire() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.hire_access where user_id = auth.uid())
$$;
revoke execute on function public.hire_role() from public, anon;
revoke execute on function public.has_hire() from public, anon;
grant execute on function public.hire_role() to authenticated;
grant execute on function public.has_hire() to authenticated;

alter table public.hire_access enable row level security;
drop policy if exists hire_access_select on public.hire_access;
drop policy if exists hire_access_insert on public.hire_access;
drop policy if exists hire_access_update on public.hire_access;
drop policy if exists hire_access_delete on public.hire_access;
create policy hire_access_select on public.hire_access for select to authenticated
  using (user_id = auth.uid() or public.hire_role() = 'owner');
create policy hire_access_insert on public.hire_access for insert to authenticated
  with check (public.hire_role() = 'owner');
create policy hire_access_update on public.hire_access for update to authenticated
  using (public.hire_role() = 'owner' and user_id <> auth.uid()) with check (public.hire_role() = 'owner');
create policy hire_access_delete on public.hire_access for delete to authenticated
  using (public.hire_role() = 'owner' and user_id <> auth.uid());

-- Names for the access list (the owner picks from the team accounts)
create or replace function public.hire_people() returns table(id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.hire_role() is distinct from 'owner' then raise exception 'Not allowed'; end if;
  return query select p.id, p.full_name, p.email from public.profiles p
    where coalesce(p.active, true) and p.archived_at is null and coalesce(p.email, '') <> 'system-check@wintertuin.app'
    order by p.full_name;
end $$;
revoke execute on function public.hire_people() from public, anon;
grant execute on function public.hire_people() to authenticated;

-- Settings: dayparts, VAT rates, cost categories, prices entered incl. or excl. VAT
create table if not exists public.hire_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.hire_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  capacity integer,
  price_daypart numeric(10,2),          -- excl. VAT
  price_day numeric(10,2),              -- excl. VAT
  vat_rate numeric(5,2) not null default 21,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.hire_bookings (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.hire_rooms(id) on delete restrict,
  booking_date date not null,
  unit text not null default 'daypart' check (unit in ('daypart', 'day')),
  dayparts text[] not null default '{}',  -- ids from the dayparts setting, when unit = 'daypart'
  client text,
  channel text not null default 'direct' check (channel in ('wintertuin', 'direct')),
  status text not null default 'confirmed' check (status in ('option', 'confirmed', 'invoiced', 'paid', 'cancelled')),
  amount_excl numeric(10,2) not null default 0,
  vat_rate numeric(5,2) not null default 21,
  invoice_no text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists hire_bookings_date on public.hire_bookings (booking_date);

create table if not exists public.hire_costs (
  id uuid primary key default gen_random_uuid(),
  cost_date date not null,
  category text,
  room_id uuid references public.hire_rooms(id) on delete set null,
  description text,
  amount_excl numeric(10,2) not null default 0,
  vat_rate numeric(5,2) not null default 21,
  monthly boolean not null default false,  -- comes back every month from cost_date
  end_date date,                           -- last month of a monthly cost (empty = keeps going)
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists hire_costs_date on public.hire_costs (cost_date);

do $$
declare tb text;
begin
  foreach tb in array array['hire_settings', 'hire_rooms', 'hire_bookings', 'hire_costs'] loop
    execute format('alter table public.%I enable row level security', tb);
    execute format('drop policy if exists %I on public.%I', tb || '_all', tb);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_hire()) with check (public.has_hire())', tb || '_all', tb);
  end loop;
end $$;

-- Access: Mette is the owner, Joost helps set it up (Mette can take that away under Mette > Instellingen)
insert into public.hire_access (user_id, role)
select u.id, 'owner' from auth.users u where lower(u.email) = 'mette@met-met.nl'
on conflict (user_id) do update set role = 'owner';
insert into public.hire_access (user_id, role)
select u.id, 'helper' from auth.users u where lower(u.email) = 'mail@joostdevos.nl'
on conflict (user_id) do nothing;
