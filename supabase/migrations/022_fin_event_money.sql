-- Money per event for Finance (managers only): the price lines of the quote, so Finance can show
-- the room hire for the landlord (Mette) per month and the real expected revenue.
create or replace function public.fin_event_money(p_rest uuid, p_from date, p_to date)
returns table(id uuid, title text, event_date date, status text, guests integer, price_lines jsonb,
              price_per_person numeric, room_hire numeric, min_spend numeric, prices_incl_vat boolean, area text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.fin_rank(p_rest) < 2 then raise exception 'Not allowed'; end if;
  return query
  select e.id, e.title, e.event_date, e.status, coalesce(e.guests_final, e.guests_guaranteed, e.guests_expected),
         coalesce(to_jsonb(e) -> 'price_lines', '[]'::jsonb), e.price_per_person, e.room_hire, e.min_spend, e.prices_incl_vat, e.area
    from events e
   where e.event_date between p_from and p_to and e.status in ('option', 'confirmed', 'done')
   order by e.event_date, e.start_time nulls last;
end $$;
revoke execute on function public.fin_event_money(uuid, date, date) from public, anon;
grant execute on function public.fin_event_money(uuid, date, date) to authenticated;
