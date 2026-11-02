-- Managers can delete dishes for good from the Archive on the Menu page (archiving stays the normal way to take a dish off).
-- Also: managers can delete files in the menu-photos storage bucket, so the photo of a deleted dish goes too.
drop policy if exists menu_items_delete on public.menu_items;
create policy menu_items_delete on public.menu_items for delete to authenticated using (public.is_manager());

drop policy if exists menu_photos_manager_delete on storage.objects;
create policy menu_photos_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-photos' and public.is_manager());
