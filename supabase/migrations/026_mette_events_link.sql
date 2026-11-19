-- Mette, phase 2: her room hire and our events work as one room calendar.
--  * An event of ours with one of her rooms (a room line on the quote) appears by itself in her Verhuur,
--    as "Via restaurant" (or "Direct" when the quote is in her name). Status, date, dayparts and amount follow the event.
--  * A booking of hers with food and drinks becomes an event of ours by itself (an option), with a follow-up
--    flag: managers get a pop-up until somebody picks it up. Her later changes or a cancellation flag it again.
--  * hire_busy(): who has which room when, without names or money, so the event form can warn for double bookings.
-- Recursion: the triggers only act at the first level (pg_trigger_depth() = 1).

-- Her rooms point to the same room in the Team app (team_settings 'rooms'); empty = matched by name
alter table public.hire_rooms add column if not exists team_room_id text;

alter table public.hire_bookings add column if not exists event_id uuid references public.events(id) on delete set null;
alter table public.hire_bookings add column if not exists with_fnb boolean not null default false;  -- food and drinks by the restaurant
alter table public.hire_bookings add column if not exists guests integer;
alter table public.hire_bookings add column if not exists contact_name text;
alter table public.hire_bookings add column if not exists contact_email text;
alter table public.hire_bookings add column if not exists contact_phone text;
alter table public.hire_bookings add column if not exists start_time time;
alter table public.hire_bookings add column if not exists end_time time;
alter table public.hire_bookings add column if not exists agreed text;          -- what Mette already agreed with the guest
alter table public.hire_bookings add column if not exists source text not null default 'mette' check (source in ('mette', 'event'));
create unique index if not exists hire_bookings_event_room on public.hire_bookings (event_id, room_id) where event_id is not null and source = 'event';

alter table public.events add column if not exists hire_booking_id uuid;        -- the booking of Mette this event came from
alter table public.events add column if not exists follow_up text check (follow_up in ('new', 'changed', 'cancelled'));
alter table public.events add column if not exists follow_up_note text;
alter table public.events add column if not exists follow_up_at timestamptz;
alter table public.events add column if not exists hire_agreed text;             -- what Mette already agreed (kept in step with her booking)

-- ------------------------------------------------------------------ helpers
create or replace function public.hire_dayparts() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value -> 'dayparts' from public.hire_settings where key = 'main'),
    '[{"id":"ochtend","name":"Ochtend","from":"08:00","to":"12:00"},{"id":"middag","name":"Middag","from":"12:00","to":"17:00"},{"id":"avond","name":"Avond","from":"17:00","to":"22:00"}]'::jsonb)
$$;

-- The dayparts a time window touches; no times = the whole day
create or replace function public.hire_parts_for(p_start time, p_end time, out unit text, out parts text[])
language plpgsql stable security definer set search_path = public as $$
declare d jsonb; all_ids text[] := '{}'; hit text[] := '{}'; e time;
begin
  for d in select * from jsonb_array_elements(public.hire_dayparts()) loop
    all_ids := all_ids || (d ->> 'id');
    if p_start is not null then
      e := coalesce(p_end, p_start + interval '3 hours');
      if e <= p_start then e := '23:59'; end if;
      if (d ->> 'from') <> '' and (d ->> 'to') <> '' and p_start < (d ->> 'to')::time and e > (d ->> 'from')::time then hit := hit || (d ->> 'id'); end if;
    end if;
  end loop;
  if p_start is null or coalesce(array_length(hit, 1), 0) = 0 or coalesce(array_length(hit, 1), 0) = coalesce(array_length(all_ids, 1), 0) then
    unit := 'day'; parts := '{}';
  else unit := 'daypart'; parts := hit; end if;
end $$;

-- The window of a booking's dayparts (for the event made from it)
create or replace function public.hire_window(p_unit text, p_parts text[], out s time, out e time)
language plpgsql stable security definer set search_path = public as $$
declare d jsonb;
begin
  for d in select * from jsonb_array_elements(public.hire_dayparts()) loop
    if p_unit = 'day' or (d ->> 'id') = any (p_parts) then
      if (d ->> 'from') <> '' and (s is null or (d ->> 'from')::time < s) then s := (d ->> 'from')::time; end if;
      if (d ->> 'to') <> '' and (e is null or (d ->> 'to')::time > e) then e := (d ->> 'to')::time; end if;
    end if;
  end loop;
end $$;

-- Her room for a Team-app room id (or the same name)
create or replace function public.hire_room_for(p_team_room text, p_label text) returns uuid
language sql stable security definer set search_path = public as $$
  select r.id from public.hire_rooms r
   where (p_team_room is not null and r.team_room_id = p_team_room)
      or (r.team_room_id is null and p_team_room is not null and lower(r.name) = lower((
            select x ->> 'name' from public.team_settings ts, jsonb_array_elements(ts.value -> 'rooms') x
             where ts.key = 'rooms' and x ->> 'id' = p_team_room limit 1)))
      or (p_label is not null and lower(r.name) = lower(regexp_replace(p_label, '^(zaalhuur|room hire)\s+', '', 'i')))
   order by (r.team_room_id = p_team_room) desc nulls last limit 1
$$;

-- ------------------------------------------------------------------ event -> her Verhuur
create or replace function public.hire_from_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ev public.events; ln jsonb; rid uuid; seen uuid[] := '{}'; w record; st text; amt numeric; vat numeric; qty numeric;
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    delete from public.hire_bookings where event_id = old.id and source = 'event' and status not in ('invoiced', 'paid');
    update public.hire_bookings set status = 'cancelled', notes = concat_ws(E'\n', notes, 'Het event van het restaurant is verwijderd.')
     where event_id = old.id and source = 'event' and status in ('invoiced', 'paid');
    return old;
  end if;
  ev := new;
  st := case ev.status when 'cancelled' then 'cancelled' when 'option' then 'option' else 'confirmed' end;
  select * into w from public.hire_parts_for(ev.start_time, ev.end_time);
  -- Mette's own booking this event came from: only the status and amount follow
  if ev.hire_booking_id is not null then
    update public.hire_bookings b set
      status = case when b.status in ('invoiced', 'paid') then b.status else st end,
      event_id = ev.id, updated_at = now()
     where b.id = ev.hire_booking_id;
  end if;
  for ln in select * from jsonb_array_elements(coalesce(to_jsonb(ev) -> 'price_lines', '[]'::jsonb)) loop
    if coalesce(ln ->> 'owner', 'landlord') = 'restaurant' then continue; end if;
    if ln ->> 'room_id' is null and coalesce(ln ->> 'label', '') !~* '^(zaalhuur|room hire)' then continue; end if;
    rid := public.hire_room_for(ln ->> 'room_id', ln ->> 'label');
    if rid is null or rid = any (seen) then continue; end if;
    seen := seen || rid;
    -- the room of her own booking: already there
    if exists (select 1 from public.hire_bookings where id = ev.hire_booking_id and room_id = rid) then continue; end if;
    vat := coalesce(nullif(ln ->> 'vat', '')::numeric, 0.21);
    qty := coalesce(nullif(ln ->> 'qty', '')::numeric, 1);
    amt := round(coalesce(nullif(ln ->> 'price', '')::numeric, 0) * qty / (1 + vat), 2);
    insert into public.hire_bookings as b (room_id, booking_date, unit, dayparts, start_time, end_time, client, channel, status, amount_excl, vat_rate,
      guests, contact_name, contact_email, contact_phone, event_id, source, notes)
    values (rid, ev.event_date, w.unit, w.parts, ev.start_time, ev.end_time, coalesce(ev.client_company, ev.client_name, ev.title),
      case when ev.quote_by = 'landlord' then 'direct' else 'wintertuin' end, st, amt, round(vat * 100, 2),
      coalesce(ev.guests_final, ev.guests_guaranteed, ev.guests_expected), ev.client_name, ev.client_email, ev.client_phone, ev.id, 'event', ev.title)
    on conflict (event_id, room_id) where event_id is not null and source = 'event' do update set
      booking_date = excluded.booking_date, unit = excluded.unit, dayparts = excluded.dayparts, start_time = excluded.start_time, end_time = excluded.end_time,
      client = excluded.client, channel = excluded.channel, amount_excl = excluded.amount_excl, vat_rate = excluded.vat_rate,
      guests = excluded.guests, contact_name = excluded.contact_name, contact_email = excluded.contact_email, contact_phone = excluded.contact_phone, notes = excluded.notes,
      status = case when b.status in ('invoiced', 'paid') then b.status else excluded.status end, updated_at = now();
  end loop;
  -- rooms taken off the event: gone from her list (kept, as cancelled, when she already invoiced)
  delete from public.hire_bookings where event_id = ev.id and source = 'event' and not (room_id = any (seen)) and status not in ('invoiced', 'paid');
  update public.hire_bookings set status = 'cancelled' where event_id = ev.id and source = 'event' and not (room_id = any (seen)) and status in ('invoiced', 'paid') and status <> 'cancelled';
  return new;
end $$;
drop trigger if exists events_to_hire on public.events;
create trigger events_to_hire after insert or update or delete on public.events for each row execute function public.hire_from_event();

-- ------------------------------------------------------------------ her booking with food and drinks -> our event
create or replace function public.hire_to_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.hire_rooms; w record; eid uuid; tid text; note text;
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.source = 'mette' and old.event_id is not null then
      update public.events set follow_up = 'cancelled', follow_up_at = now(), hire_booking_id = null,
        follow_up_note = 'Mette heeft haar boeking verwijderd.' where id = old.event_id;
    end if;
    return old;
  end if;
  if new.source <> 'mette' then return new; end if;
  select * into r from public.hire_rooms where id = new.room_id;
  -- new with food and drinks, or switched on later: make the event
  if new.with_fnb and new.event_id is null and new.status <> 'cancelled' then
    select * into w from public.hire_window(new.unit, new.dayparts);
    tid := coalesce(r.team_room_id, (select x ->> 'id' from public.team_settings ts, jsonb_array_elements(ts.value -> 'rooms') x
                                     where ts.key = 'rooms' and lower(x ->> 'name') = lower(r.name) limit 1));
    insert into public.events (title, event_date, start_time, end_time, status, client_name, client_company, client_email, client_phone,
      guests_expected, area, notes_internal, price_lines, quote_by, hire_booking_id, hire_agreed, follow_up, follow_up_at, follow_up_note, created_by)
    values (concat('Aanvraag via Mette: ', coalesce(new.client, new.contact_name, r.name)), new.booking_date,
      coalesce(new.start_time, w.s), coalesce(new.end_time, w.e), 'option',
      coalesce(new.contact_name, new.client), case when new.contact_name is not null then new.client end, new.contact_email, new.contact_phone,
      new.guests, r.name, nullif(concat_ws(E'\n', 'Aanvraag van Mette (zaalverhuur), met eten en drinken.', new.notes), ''),
      jsonb_build_array(jsonb_build_object('label', concat('Zaalhuur ', r.name), 'per', 'fixed', 'qty', 1,
        'price', round(new.amount_excl * (1 + new.vat_rate / 100), 2), 'vat', round(new.vat_rate / 100, 2), 'room_id', tid, 'owner', 'landlord')),
      'restaurant', new.id, new.agreed, 'new', now(), 'Nieuwe aanvraag van Mette met eten en drinken.', new.created_by)
    returning id into eid;
    update public.hire_bookings set event_id = eid where id = new.id;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.event_id is not null then
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      update public.events set follow_up = 'cancelled', follow_up_at = now(), follow_up_note = 'Mette heeft haar boeking geannuleerd.' where id = new.event_id;
    elsif not new.with_fnb and old.with_fnb then
      update public.events set follow_up = 'changed', follow_up_at = now(), follow_up_note = 'Mette heeft eten en drinken uitgezet bij haar boeking.' where id = new.event_id;
    elsif (new.booking_date, new.room_id, new.unit, new.dayparts, new.guests, new.start_time, new.end_time, new.agreed, new.contact_name, new.contact_email, new.contact_phone)
          is distinct from (old.booking_date, old.room_id, old.unit, old.dayparts, old.guests, old.start_time, old.end_time, old.agreed, old.contact_name, old.contact_email, old.contact_phone) then
      select * into w from public.hire_window(new.unit, new.dayparts);
      note := concat_ws(', ',
        case when new.booking_date <> old.booking_date then concat('datum ', to_char(old.booking_date, 'DD-MM'), ' > ', to_char(new.booking_date, 'DD-MM')) end,
        case when new.room_id <> old.room_id then concat('zaal > ', r.name) end,
        case when (new.unit, new.dayparts, new.start_time, new.end_time) is distinct from (old.unit, old.dayparts, old.start_time, old.end_time) then 'tijden' end,
        case when new.guests is distinct from old.guests then concat('gasten ', coalesce(old.guests::text, '?'), ' > ', coalesce(new.guests::text, '?')) end,
        case when new.agreed is distinct from old.agreed then 'afspraken' end,
        case when (new.contact_name, new.contact_email, new.contact_phone) is distinct from (old.contact_name, old.contact_email, old.contact_phone) then 'contactgegevens' end);
      update public.events set event_date = new.booking_date, start_time = coalesce(new.start_time, w.s), end_time = coalesce(new.end_time, w.e),
        guests_expected = coalesce(new.guests, guests_expected), area = r.name, hire_agreed = new.agreed,
        client_email = coalesce(new.contact_email, client_email), client_phone = coalesce(new.contact_phone, client_phone),
        follow_up = 'changed', follow_up_at = now(), follow_up_note = concat('Mette heeft haar boeking gewijzigd: ', note, '.')
       where id = new.event_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists hire_bookings_to_event on public.hire_bookings;
create trigger hire_bookings_to_event after insert or update or delete on public.hire_bookings for each row execute function public.hire_to_event();

-- ------------------------------------------------------------------ who has which room when (no names, no money)
create or replace function public.hire_busy(p_from date, p_to date)
returns table(booking_date date, room_name text, team_room_id text, unit text, dayparts text[], daypart_names text, status text, event_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_active_staff() then raise exception 'Not allowed'; end if;
  return query
  select b.booking_date, r.name, coalesce(r.team_room_id, (select x ->> 'id' from public.team_settings ts, jsonb_array_elements(ts.value -> 'rooms') x
                                                          where ts.key = 'rooms' and lower(x ->> 'name') = lower(r.name) limit 1)),
         b.unit, b.dayparts,
         case when b.unit = 'day' then 'hele dag' else (select string_agg(d ->> 'name', ', ') from jsonb_array_elements(public.hire_dayparts()) d where (d ->> 'id') = any (b.dayparts)) end,
         b.status, b.event_id
    from public.hire_bookings b join public.hire_rooms r on r.id = b.room_id
   where b.booking_date between p_from and p_to and b.status <> 'cancelled';
end $$;
revoke execute on function public.hire_busy(date, date) from public, anon;
grant execute on function public.hire_busy(date, date) to authenticated;
revoke execute on function public.hire_dayparts() from public, anon;
revoke execute on function public.hire_parts_for(time, time) from public, anon;
revoke execute on function public.hire_window(text, text[]) from public, anon;
revoke execute on function public.hire_room_for(text, text) from public, anon;
grant execute on function public.hire_dayparts() to authenticated;

-- Follow-up done: managers clear the flag (the pop-up then stops)
create or replace function public.event_follow_up_done(p_event uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Not allowed'; end if;
  update public.events set follow_up = null, follow_up_note = null, follow_up_at = null where id = p_event;
end $$;
revoke execute on function public.event_follow_up_done(uuid) from public, anon;
grant execute on function public.event_follow_up_done(uuid) to authenticated;

-- The follow-up flag is not a change of the event: no new version for it
create or replace function public.events_versioning()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old) - 'version' - 'updated_at' - 'updated_by' - 'created_at' - 'created_by' - 'follow_up' - 'follow_up_note' - 'follow_up_at';
  n jsonb := to_jsonb(new) - 'version' - 'updated_at' - 'updated_by' - 'created_at' - 'created_by' - 'follow_up' - 'follow_up_note' - 'follow_up_at';
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

-- Fill her list once with the events that already have one of her rooms
update public.events set updated_at = updated_at where coalesce(jsonb_array_length(to_jsonb(events) -> 'price_lines'), 0) > 0;
