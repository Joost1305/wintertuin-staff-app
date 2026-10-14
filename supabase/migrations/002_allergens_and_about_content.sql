-- The 14 EU allergens per menu item (codes, labels live in the app)
alter table public.menu_items add column if not exists allergens text[] not null default '{}';

-- Editable text of the About pages: one row per editable block, managers write, everyone reads
create table if not exists public.about_content (
  page text not null,
  key text not null,
  html text not null,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (page, key)
);
alter table public.about_content enable row level security;
create policy about_content_select on public.about_content for select to anon, authenticated using (true);
create policy about_content_insert on public.about_content for insert to authenticated with check (public.is_manager());
create policy about_content_update on public.about_content for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy about_content_delete on public.about_content for delete to authenticated using (public.is_manager());
