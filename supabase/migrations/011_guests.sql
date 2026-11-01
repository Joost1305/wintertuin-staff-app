-- Guests: one list of everyone we have contact details for, built from every event plus guests added by hand.
-- Only managers can see or change it (personal data). Newsletter only with consent (AVG/GDPR):
-- the consent box on the event (newsletter_ok) or a manager ticking it after a guest said yes.

alter table public.events add column if not exists newsletter_ok boolean not null default false;

create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  name text,
  company text,
  email text,
  phone text,
  newsletter boolean not null default false,
  newsletter_at timestamptz,             -- when the guest said yes
  newsletter_source text,                -- 'event', 'manual', 'form'
  source text not null default 'manual', -- where we first met: 'event' or 'manual'
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index if not exists guests_email_key on public.guests (lower(email)) where email is not null and email <> '';
alter table public.guests enable row level security;
drop policy if exists guests_select on public.guests;
drop policy if exists guests_insert on public.guests;
drop policy if exists guests_update on public.guests;
drop policy if exists guests_delete on public.guests;
create policy guests_select on public.guests for select to authenticated using (public.is_manager());
create policy guests_insert on public.guests for insert to authenticated with check (public.is_manager());
create policy guests_update on public.guests for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy guests_delete on public.guests for delete to authenticated using (public.is_manager());

-- Every event with an email address keeps the guest list up to date: new guests are added, empty fields filled in,
-- and a yes on the event turns the newsletter on. A no on the event never turns it off (that is done in Guests).
create or replace function public.guests_from_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_email is null or btrim(new.client_email) = '' then return new; end if;
  insert into guests (name, company, email, phone, newsletter, newsletter_at, newsletter_source, source)
  values (new.client_name, new.client_company, lower(btrim(new.client_email)), new.client_phone,
          new.newsletter_ok, case when new.newsletter_ok then now() end, case when new.newsletter_ok then 'event' end, 'event')
  on conflict (lower(email)) where email is not null and email <> '' do update set
    name = coalesce(guests.name, excluded.name),
    company = coalesce(guests.company, excluded.company),
    phone = coalesce(guests.phone, excluded.phone),
    newsletter = guests.newsletter or excluded.newsletter,
    newsletter_at = case when not guests.newsletter and excluded.newsletter then now() else guests.newsletter_at end,
    newsletter_source = case when not guests.newsletter and excluded.newsletter then 'event' else guests.newsletter_source end,
    updated_at = now();
  return new;
end $$;
drop trigger if exists events_to_guests on public.events;
create trigger events_to_guests after insert or update of client_email, client_name, client_company, client_phone, newsletter_ok
  on public.events for each row execute function public.guests_from_event();

-- Fill the list once with the events that are already there
insert into public.guests (name, company, email, phone, source)
select distinct on (lower(btrim(e.client_email))) e.client_name, e.client_company, lower(btrim(e.client_email)), e.client_phone, 'event'
from public.events e
where e.client_email is not null and btrim(e.client_email) <> ''
order by lower(btrim(e.client_email)), e.event_date desc
on conflict do nothing;
