-- HACCP registrations (Hygiënecode voor de Horeca, KHN registration forms).
-- haccp_entries: one row per filled-in registration (a temperature round, a delivery check, a sous-vide run ...).
--   Everyone signed in can read and add. You can correct your own entry for 24 hours; after that only managers
--   can change or delete, so the record holds up at an inspection.
-- haccp_config: the lists that belong to this restaurant (fridges and freezers, cleaning objects, approved
--   suppliers, which lists are switched on). Only managers change it.

create table if not exists public.haccp_entries (
  id uuid primary key default gen_random_uuid(),
  list_key text not null,
  entry_date date not null default current_date,
  data jsonb not null default '{}'::jsonb,
  ok boolean,
  action text,
  staff_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index if not exists haccp_entries_list_date on public.haccp_entries (list_key, entry_date);
alter table public.haccp_entries enable row level security;
create policy haccp_entries_select on public.haccp_entries for select to authenticated using (true);
create policy haccp_entries_insert on public.haccp_entries for insert to authenticated with check (staff_id = auth.uid());
create policy haccp_entries_update on public.haccp_entries for update to authenticated
  using (public.is_manager() or (staff_id = auth.uid() and created_at > now() - interval '24 hours'))
  with check (public.is_manager() or (staff_id = auth.uid() and created_at > now() - interval '24 hours'));
create policy haccp_entries_delete on public.haccp_entries for delete to authenticated using (public.is_manager());

create table if not exists public.haccp_config (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.haccp_config enable row level security;
create policy haccp_config_select on public.haccp_config for select to authenticated using (true);
create policy haccp_config_insert on public.haccp_config for insert to authenticated with check (public.is_manager());
create policy haccp_config_update on public.haccp_config for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy haccp_config_delete on public.haccp_config for delete to authenticated using (public.is_manager());

-- Starting point, to be renamed in Settings > HACCP
insert into public.haccp_config (key, value) values
('equipment', '[
  {"id":"cool1","name":"Koelcel","kind":"cool"},
  {"id":"frz1","name":"Vriezer","kind":"freeze"},
  {"id":"cool2","name":"Koelwerkbank keuken","kind":"cool"},
  {"id":"cool3","name":"Koeling bar","kind":"cool"}
]'::jsonb),
('cleaning', '[
  {"id":"c01","name":"Werkbanken","clean":true,"disinfect":true,"freq":"D"},
  {"id":"c02","name":"Vloer","clean":true,"disinfect":true,"freq":"D"},
  {"id":"c03","name":"Vaatwasser","clean":true,"disinfect":false,"freq":"D"},
  {"id":"c04","name":"Afvalbakken","clean":true,"disinfect":true,"freq":"D"},
  {"id":"c05","name":"Schoonmaakmateriaal","clean":true,"disinfect":true,"freq":"D"},
  {"id":"c06","name":"Handcontactpunten","clean":true,"disinfect":true,"freq":"D"},
  {"id":"c07","name":"Handenwasgelegenheid","clean":true,"disinfect":true,"freq":"D"},
  {"id":"c08","name":"Spoelbakken","clean":true,"disinfect":true,"freq":"D"},
  {"id":"c09","name":"Grill / plancha","clean":true,"disinfect":false,"freq":"D"},
  {"id":"c10","name":"Snijplanken","clean":true,"disinfect":true,"freq":"N"},
  {"id":"c11","name":"Snijgereedschap","clean":true,"disinfect":true,"freq":"N"},
  {"id":"c12","name":"Keukenmachines","clean":true,"disinfect":true,"freq":"N"},
  {"id":"c13","name":"Kleine productiematerialen","clean":true,"disinfect":true,"freq":"N"},
  {"id":"c14","name":"Magnetron","clean":true,"disinfect":true,"freq":"N"},
  {"id":"c15","name":"Koelingen","clean":true,"disinfect":true,"freq":"W"},
  {"id":"c16","name":"Frituur","clean":true,"disinfect":false,"freq":"W"},
  {"id":"c17","name":"Afzuiging (incl. roosters)","clean":true,"disinfect":false,"freq":"W"},
  {"id":"c18","name":"Wanden","clean":true,"disinfect":false,"freq":"W"},
  {"id":"c19","name":"Verdampers","clean":true,"disinfect":false,"freq":"M"},
  {"id":"c20","name":"Magazijnstellingen","clean":true,"disinfect":false,"freq":"M"},
  {"id":"c21","name":"Vriezers","clean":true,"disinfect":false,"freq":"H"}
]'::jsonb),
('lists', '["temperatures","receiving","cooking","cleaning","thermometers","hygiene","suppliers","sousvide","acidified","buffet"]'::jsonb)
on conflict (key) do nothing;

-- Approved suppliers: start from the suppliers already known in Wintertuin Finance
insert into public.haccp_config (key, value)
select 'suppliers', coalesce(jsonb_agg(jsonb_build_object('id', s.id::text, 'name', s.name, 'supplies', coalesce(c.name_nl, ''), 'notes', '') order by s.name), '[]'::jsonb)
from public.fin_suppliers s left join public.fin_purchase_categories c on c.id = s.category_id
where coalesce(s.active, true)
on conflict (key) do nothing;

