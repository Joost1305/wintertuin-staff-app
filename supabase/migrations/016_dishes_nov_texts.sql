-- Better descriptions for the three lunch dishes of 7 Nov 2026.
update public.menu_items set description = 'Romige soep van rode linzen met geroosterde komijn en tikka masala, met yoghurt en verse koriander. Met brood.' where lower(name) = 'indiase linzensoep';
update public.menu_items set description = 'Warme pita met oesterzwam, langzaam gestoofd in rendang van kokos, citroengras en galangal. Met frisse, huisgemaakte atjar van komkommer, wortel en rode ui.' where lower(name) = 'pita rendang van oesterzwam';
update public.menu_items set description = 'Krokante falafel van kikkererwten en verse kruiden in een warme pita, met huisgemaakte hummus, tahin en een frisse salade.' where lower(name) = 'pita falafel';
