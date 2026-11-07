-- Rendang van oesterzwam contains soy.
update public.menu_items set allergens = array(select distinct unnest(allergens || array['soy'])) where lower(name) = 'pita rendang van oesterzwam';
