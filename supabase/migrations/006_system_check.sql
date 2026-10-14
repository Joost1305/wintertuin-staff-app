-- Morning system check for both Wintertuin apps (one database).
-- Every morning (GitHub job) and on request (Settings > System check) the system-check function tests
-- what the apps depend on, lists the important changes of the last 24 hours and the gaps in the data.
-- Results are stored here; managers of either app can read them. Red makes the morning job fail,
-- and GitHub then e-mails the owner.

create table if not exists public.system_checks (
  id          bigint generated always as identity primary key,
  run_at      timestamptz not null default now(),
  trigger     text not null default 'schedule' check (trigger in ('schedule', 'manual')),
  status      text not null check (status in ('ok', 'warn', 'fail')),
  checks      jsonb not null default '[]',      -- [{ key, status, detail, ms }]
  changes     jsonb not null default '[]',      -- important changes in the window
  gaps        jsonb not null default '[]',      -- [{ key, count, items }]
  window_from timestamptz,
  window_to   timestamptz
);
create index if not exists system_checks_run_idx on public.system_checks (run_at desc);
alter table public.system_checks enable row level security;

-- Managers of the team app or the finance app
create or replace function public.is_any_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_manager()
      or exists (select 1 from public.fin_app_users u where u.user_id = auth.uid() and u.active
                 and u.role in ('manager', 'org_admin', 'super_admin'));
$$;
revoke execute on function public.is_any_manager() from public, anon;
grant execute on function public.is_any_manager() to authenticated;

create policy system_checks_select on public.system_checks for select to authenticated using (public.is_any_manager());
grant select on public.system_checks to authenticated;

-- Everything the check needs from the database, in one call (service role only)
create or replace function public.system_check_inputs(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rest uuid;
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_changes jsonb; v_gaps jsonb := '[]'::jsonb; v jsonb;
begin
  select id into v_rest from fin_restaurants order by created_at limit 1;

  -- Important changes: settings in Finance (not the daily figures) and events
  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) into v_changes from (
    select jsonb_build_object('at', a.at, 'user', coalesce(p.full_name, fu.full_name, case when a.user_id is null then 'system' end),
             'app', 'finance', 'entity', a.table_name, 'action', lower(a.action),
             'name', coalesce(a.new_data ->> 'name', a.new_data ->> 'name_en', a.old_data ->> 'name', a.old_data ->> 'name_en', a.new_data ->> 'full_name', a.new_data ->> 'day', a.old_data ->> 'day', a.row_id)) x
      from fin_audit_log a
      left join profiles p on p.id = a.user_id
      left join lateral (select z.full_name from fin_app_users z where z.user_id = a.user_id limit 1) fu on true
     where a.at >= p_from and a.at < p_to
       and a.table_name not in ('fin_days', 'fin_day_revenue', 'fin_purchases', 'fin_hours', 'fin_weather', 'fin_inventory_counts')
    union all
    select jsonb_build_object('at', v.changed_at, 'user', p.full_name, 'app', 'team', 'entity', 'events', 'action', 'update',
             'name', e.title, 'version', v.version + 1)
      from event_versions v join events e on e.id = v.event_id left join profiles p on p.id = v.changed_by
     where v.changed_at >= p_from and v.changed_at < p_to
    union all
    select jsonb_build_object('at', e.created_at, 'user', p.full_name, 'app', 'team', 'entity', 'events', 'action', 'create', 'name', e.title)
      from events e left join profiles p on p.id = e.created_by
     where e.created_at >= p_from and e.created_at < p_to
    limit 200
  ) s;

  if v_rest is not null then
    -- Days where people worked (roster or clock-in) but the daily closing is not complete (last 7 days)
    select jsonb_build_object('key', 'missing_days', 'count', count(*), 'items', coalesce(jsonb_agg(w.day order by w.day desc), '[]'::jsonb)) into v
      from (select distinct shift_date as day from shifts where shift_date between v_today - 7 and v_today - 1
            union select distinct (check_in_at at time zone 'Europe/Amsterdam')::date from checkins
             where check_in_at >= ((v_today - 7)::timestamp at time zone 'Europe/Amsterdam') and check_in_at < (v_today::timestamp at time zone 'Europe/Amsterdam')) w
     where not exists (select 1 from fin_days d where d.restaurant_id = v_rest and d.day = w.day and d.status = 'complete');
    if (v ->> 'count')::int > 0 then v_gaps := v_gaps || v; end if;
    -- Team members on the roster who are not linked in Finance (their hours do not flow into the closing)
    select jsonb_build_object('key', 'not_linked', 'count', count(*), 'items', coalesce(jsonb_agg(x.full_name order by x.full_name), '[]'::jsonb)) into v
      from (select distinct p.full_name from shifts s join profiles p on p.id = s.staff_id
             where s.shift_date between v_today - 14 and v_today + 14 and coalesce(p.active, true)
               and not exists (select 1 from fin_staff f where f.user_id = p.id and f.restaurant_id = v_rest)) x;
    if (v ->> 'count')::int > 0 then v_gaps := v_gaps || v; end if;
    -- Team members (not partners) without an hourly rate: labor cost stays empty
    select jsonb_build_object('key', 'no_rate', 'count', count(*), 'items', coalesce(jsonb_agg(f.name order by f.name), '[]'::jsonb)) into v
      from fin_staff f where f.restaurant_id = v_rest and f.active and not f.is_partner
       and not exists (select 1 from fin_staff_rates r where r.staff_id = f.id);
    if (v ->> 'count')::int > 0 then v_gaps := v_gaps || v; end if;
  end if;

  -- Events that need attention
  select jsonb_build_object('key', 'option_expiring', 'count', count(*), 'items', coalesce(jsonb_agg(e.title || ' (' || to_char(e.option_until, 'DD-MM') || ')' order by e.option_until), '[]'::jsonb)) into v
    from events e where e.status = 'option' and e.option_until is not null and e.option_until <= v_today + 3 and e.event_date >= v_today;
  if (v ->> 'count')::int > 0 then v_gaps := v_gaps || v; end if;
  select jsonb_build_object('key', 'final_count', 'count', count(*), 'items', coalesce(jsonb_agg(e.title || ' (' || to_char(e.event_date, 'DD-MM') || ')' order by e.event_date), '[]'::jsonb)) into v
    from events e where e.status = 'confirmed' and e.event_date >= v_today and e.guests_final is null
     and e.guarantee_deadline is not null and e.guarantee_deadline <= v_today;
  if (v ->> 'count')::int > 0 then v_gaps := v_gaps || v; end if;
  select jsonb_build_object('key', 'deposit_overdue', 'count', count(*), 'items', coalesce(jsonb_agg(e.title || ' (' || to_char(e.deposit_due, 'DD-MM') || ')' order by e.deposit_due), '[]'::jsonb)) into v
    from events e where e.status in ('option', 'confirmed') and coalesce(e.deposit, 0) > 0 and not e.deposit_paid
     and e.deposit_due is not null and e.deposit_due < v_today;
  if (v ->> 'count')::int > 0 then v_gaps := v_gaps || v; end if;
  select jsonb_build_object('key', 'understaffed', 'count', count(*), 'items', coalesce(jsonb_agg(x.t order by x.d), '[]'::jsonb)) into v
    from (select e.event_date d, e.title || ' (' || to_char(e.event_date, 'DD-MM') || ': ' || count(s.id) || '/' || e.staff_needed || ')' t
            from events e left join shifts s on s.shift_date = e.event_date
           where e.status = 'confirmed' and e.event_date between v_today and v_today + 7 and e.staff_needed is not null
           group by e.id, e.event_date, e.title, e.staff_needed having count(s.id) < e.staff_needed) x;
  if (v ->> 'count')::int > 0 then v_gaps := v_gaps || v; end if;
  select jsonb_build_object('key', 'allergens_unknown', 'count', count(*), 'items', coalesce(jsonb_agg(e.title || ' (' || to_char(e.event_date, 'DD-MM') || ')' order by e.event_date), '[]'::jsonb)) into v
    from events e where e.status = 'confirmed' and e.event_date between v_today and v_today + 14
     and exists (select 1 from jsonb_array_elements(e.menu) m where coalesce(m ->> 'item_id', '') = '' and coalesce(m ->> 'name', '') <> '');
  if (v ->> 'count')::int > 0 then v_gaps := v_gaps || v; end if;

  return jsonb_build_object('changes', v_changes, 'gaps', v_gaps,
    'last_check', (select run_at from system_checks order by run_at desc limit 1));
end $$;
revoke execute on function public.system_check_inputs(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.system_check_inputs(timestamptz, timestamptz) to service_role;
