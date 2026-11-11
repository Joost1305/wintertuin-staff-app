-- A short line about what the event is (for example "3-gangen lunch"), shown in the event list under the title.
-- Left empty, the app makes one from the menu and the times when the event is saved.
alter table public.events add column if not exists summary text;
