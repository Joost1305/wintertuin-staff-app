-- Events with a Banqueting and Event Order (BEO).
-- Every active team member can create and edit events; only managers delete.
-- Each save that changes something stores the previous version in event_versions (change history).
-- A confirmed event opens that day in the calendar and adds a note "Event: <title>, <n>p".

create or replace function public.is_active_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and coalesce(active, true));
$$;
revoke execute on function public.is_active_staff() from public, anon;
grant execute on function public.is_active_staff() to authenticated;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_type text,
  event_date date not null,
  start_time time,
  end_time time,
  status text not null default 'option' check (status in ('option', 'confirmed', 'cancelled', 'done')),
  option_until date,
  sold_by uuid references public.profiles(id),
  -- client
  client_name text, client_company text, client_phone text, client_email text,
  day_contact_name text, day_contact_phone text,
  invoice_details text, reference text,
  -- guests
  guests_expected integer, guests_guaranteed integer, guarantee_deadline date, guests_final integer, children integer,
  dietary jsonb not null default '[]'::jsonb,          -- [{ type, count, who }]
  -- space and setup
  area text, exclusive boolean not null default false, setup text,
  -- food and drinks
  service_style text,
  menu jsonb not null default '[]'::jsonb,             -- [{ course, item_id, name, allergens: [] }]
  drinks text,
  -- timeline, extras, staffing
  timeline jsonb not null default '[]'::jsonb,         -- [{ time, what }]
  extras text,
  staff_needed integer,
  staffing text,
  -- money
  price_per_person numeric(10,2), room_hire numeric(10,2), min_spend numeric(10,2),
  deposit numeric(10,2), deposit_due date, deposit_paid boolean not null default false,
  payment_terms text, cancellation_terms text,
  -- notes per department
  notes_kitchen text, notes_bar text, notes_service text, notes_cleaning text, notes_internal text,
  -- client confirmation
  client_confirmed_at date, client_confirmed_by text,
  version integer not null default 1,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);
create index if not exists events_date_idx on public.events (event_date);

create table if not exists public.event_versions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,             -- the event as it was in this version
  changed_by uuid,                     -- who made the NEXT version
  changed_at timestamptz not null default now(),
  unique (event_id, version)
);

alter table public.events enable row level security;
alter table public.event_versions enable row level security;
create policy events_select on public.events for select to authenticated using (public.is_active_staff());
create policy events_insert on public.events for insert to authenticated with check (public.is_active_staff());
create policy events_update on public.events for update to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
create policy events_delete on public.events for delete to authenticated using (public.is_manager());
create policy event_versions_select on public.event_versions for select to authenticated using (public.is_active_staff());
grant select, insert, update, delete on public.events to authenticated;
grant select on public.event_versions to authenticated;

-- Version history: keep the old row when anything that matters changed
create or replace function public.events_versioning()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old) - 'version' - 'updated_at' - 'updated_by' - 'created_at' - 'created_by';
  n jsonb := to_jsonb(new) - 'version' - 'updated_at' - 'updated_by' - 'created_at' - 'created_by';
begin
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if o is distinct from n then
    insert into event_versions (event_id, version, snapshot, changed_by) values (old.id, old.version, to_jsonb(old), auth.uid())
    on conflict (event_id, version) do nothing;
    new.version := old.version + 1;
    new.updated_at := now();
    new.updated_by := auth.uid();
  else
    new.version := old.version;
  end if;
  return new;
end $$;
revoke execute on function public.events_versioning() from public, anon;
create trigger events_versioning before update on public.events for each row execute function public.events_versioning();

create or replace function public.events_new_defaults()
returns trigger language plpgsql as $$
begin
  new.version := 1; new.created_by := auth.uid(); new.updated_by := auth.uid(); new.created_at := now(); new.updated_at := now();
  return new;
end $$;
create trigger events_new_defaults before insert on public.events for each row execute function public.events_new_defaults();

-- Calendar link: confirmed events open the day with a note; when not confirmed any more, the note goes again.
-- A note someone typed by hand (not starting with "Event:") is never overwritten.
create or replace function public.events_calendar_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_rest uuid; r record; v_note text; v_day date;
begin
  select id into v_rest from fin_restaurants order by created_at limit 1;
  if v_rest is null then return coalesce(new, old); end if;
  -- clean the old day when the date moved, the status changed or the event was deleted
  if tg_op in ('UPDATE', 'DELETE') then
    v_day := old.event_date;
    if tg_op = 'DELETE' or new.event_date <> old.event_date or new.status <> 'confirmed' then
      -- another confirmed event on that day keeps its note
      select string_agg('Event: ' || e.title || coalesce(', ' || coalesce(e.guests_final, e.guests_guaranteed, e.guests_expected) || 'p', ''), ' + ' order by e.start_time nulls last)
        into v_note from events e where e.event_date = v_day and e.status = 'confirmed' and (tg_op = 'DELETE' or e.id <> old.id);
      select * into r from fin_closures where restaurant_id = v_rest and day = v_day;
      -- only touch what an event wrote itself (note starting with "Event:")
      if found and r.note like 'Event:%' then
        if v_note is not null then update fin_closures set note = left(v_note, 120) where id = r.id;
        else delete from fin_closures where id = r.id;   -- back to the regular opening hours
        end if;
      end if;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'confirmed' then
    select string_agg('Event: ' || e.title || coalesce(', ' || coalesce(e.guests_final, e.guests_guaranteed, e.guests_expected) || 'p', ''), ' + ' order by e.start_time nulls last)
      into v_note from (select * from events where event_date = new.event_date and status = 'confirmed' and id <> new.id
                        union all select new.*) e;
    select * into r from fin_closures where restaurant_id = v_rest and day = new.event_date;
    if not found then
      insert into fin_closures (restaurant_id, day, is_open, note) values (v_rest, new.event_date, true, left(v_note, 120));
    elsif r.note is null or r.note like 'Event:%' then
      update fin_closures set is_open = true, note = left(v_note, 120) where id = r.id;
    else
      update fin_closures set is_open = true where id = r.id;
    end if;
  end if;
  return coalesce(new, old);
end $$;
revoke execute on function public.events_calendar_sync() from public, anon;
create trigger events_calendar_sync after insert or update or delete on public.events for each row execute function public.events_calendar_sync();

-- Prices on the client confirmation are shown including or excluding VAT
alter table public.events add column if not exists prices_incl_vat boolean not null default true;
