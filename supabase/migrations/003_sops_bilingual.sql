-- SOPs in English and Dutch. Dutch stays in the original columns; English is optional.
-- The checklists must have the same lines in the same order, because daily ticks are stored per line number.
alter table public.sops
  add column if not exists category_en text,
  add column if not exists title_en text,
  add column if not exists content_en text,
  add column if not exists items_en jsonb not null default '[]'::jsonb;
