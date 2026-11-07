-- Three new lunch dishes on the menu (7 Nov 2026). Only added when the name is not there yet.
-- Prices still open; allergens are the obvious ones, check them in the app.
insert into public.menu_items (name, category, group_type, description, allergens, seasons, active, dish_date, sort_order)
select v.name, 'Lunch', 'food', v.descr, v.al, v.se, true, date '2026-11-07',
       coalesce((select max(sort_order) from public.menu_items), 0) + v.n * 10
from (values
  (1, 'Indiase linzensoep', 'Rode linzen met komijn, tikka masala en yoghurt.', array['milk'], array['najaar','winter']),
  (2, 'Pita rendang van oesterzwam', 'Pitabroodje met rendang van oesterzwam en huisgemaakte atjar.', array['gluten'], array[]::text[]),
  (3, 'Pita falafel', 'Pitabroodje met falafel en hummus.', array['gluten','sesame'], array[]::text[])
) as v(n, name, descr, al, se)
where not exists (select 1 from public.menu_items m where lower(m.name) = lower(v.name));
