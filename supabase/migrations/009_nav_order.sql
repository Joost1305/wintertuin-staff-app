-- Order of the top menu, set by managers in Settings and the same for everyone.
create table if not exists public.team_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.team_settings enable row level security;
create policy team_settings_select on public.team_settings for select to authenticated using (true);
create policy team_settings_insert on public.team_settings for insert to authenticated with check (public.is_manager());
create policy team_settings_update on public.team_settings for update to authenticated using (public.is_manager()) with check (public.is_manager());

-- Wintertuin Finance: per restaurant (also in the Finance repo, migration for nav order)
alter table public.fin_restaurants add column if not exists nav_order jsonb;
