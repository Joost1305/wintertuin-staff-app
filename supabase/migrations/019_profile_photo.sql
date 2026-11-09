-- A photo per person, shown in the round avatars (roster, today, PIN screen) instead of the initials.
alter table public.profiles add column if not exists photo_url text;
