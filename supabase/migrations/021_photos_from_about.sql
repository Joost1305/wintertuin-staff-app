-- Use the team photos from the About page as profile photos (matched on first name),
-- for everyone who has no photo yet (Joost, Jane, Carel, Kees).
do $$
declare
  src text; arr jsonb; el jsonb; ph text; nm text; n int := 0; c int;
begin
  select html into src from public.about_content where key = 'team' order by updated_at desc limit 1;
  if src is null then select html into src from public.about_content where key = 'people' order by updated_at desc limit 1; end if;
  if src is null then raise exception 'No team on the About page found'; end if;
  arr := src::jsonb;
  for el in select * from jsonb_array_elements(arr) loop
    ph := nullif(el->>'photo', ''); nm := lower(split_part(trim(el->>'name'), ' ', 1));
    if ph is null or nm = '' then continue; end if;
    if ph !~ '^https?://' then ph := 'https://joost1305.github.io/wintertuin-staff-app/' || regexp_replace(ph, '^\./?|^/', ''); end if;
    update public.profiles set photo_url = ph
      where photo_url is null and lower(split_part(trim(full_name), ' ', 1)) = nm and archived_at is null;
    get diagnostics c = row_count; n := n + c;
  end loop;
  if n = 0 then raise exception 'No profile matched a photo on the About page'; end if;
end $$;
