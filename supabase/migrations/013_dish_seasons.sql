-- Dish database: every dish gets seasons (voorjaar, zomer, najaar, winter; none = all year) and a date,
-- so a menu can be put together per season. Existing dishes get today's date.
alter table public.menu_items add column if not exists seasons text[] not null default '{}';
alter table public.menu_items add column if not exists dish_date date;
update public.menu_items set dish_date = current_date where dish_date is null;
alter table public.menu_items alter column dish_date set default current_date;
create index if not exists menu_items_seasons_idx on public.menu_items using gin (seasons);
