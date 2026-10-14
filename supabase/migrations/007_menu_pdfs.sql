-- Menu PDFs: several named menus (BQT menu, Shop menu, Lunch menu, ...) shown as buttons on the Menu page.
-- Files live in the existing public 'menu-photos' bucket under menu-pdf/. Everyone signed in can read the list,
-- only managers can add, rename, replace or delete.
create table if not exists public.menu_pdfs (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 60),
  path text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.menu_pdfs enable row level security;
create policy menu_pdfs_select on public.menu_pdfs for select to authenticated using (true);
create policy menu_pdfs_insert on public.menu_pdfs for insert to authenticated with check (public.is_manager());
create policy menu_pdfs_update on public.menu_pdfs for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy menu_pdfs_delete on public.menu_pdfs for delete to authenticated using (public.is_manager());

-- carry over the single menu PDF that was uploaded before this table existed
insert into public.menu_pdfs (label, path, sort_order)
select 'See the whole menu', 'menu-pdf/menu.pdf', 10
where exists (select 1 from storage.objects where bucket_id = 'menu-photos' and name = 'menu-pdf/menu.pdf')
on conflict (path) do nothing;
