-- =============================================================================
-- Glowbook closures validation suite (decision 147)
-- (migrations 20261115154130_glowbook_closures, 20261115160023_glowbook_closures_decision_number)
-- =============================================================================
--   C1  anon, a member without the plan and a member without a Glowbook cannot
--       add a period; the table is not readable by members;
--   C2  invalid periods are refused (past start, end before start, too long,
--       note too long);
--   C3  a period keeps the appointment already booked in it (and counts it),
--       offers no slot on its days — not even an hour opened by hand — and
--       refuses a booking there;
--   C4  the artist's calendar lists the period with its appointment and the
--       page's state; another artist sees nothing of it and cannot delete it;
--   C5  at most 20 periods not ended yet;
--   C6  deleting the period gives the hours back;
--   C7  the purge drops periods ended more than 30 days ago only;
--   C8  the personal data export lists the periods.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL GLOWBOOK CLOSURES TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  artist  uuid := '00000000-0000-4000-a000-000000b70001';
  other   uuid := '00000000-0000-4000-a000-000000b70002';
  m_none  uuid := '00000000-0000-4000-a000-000000b70003';
  client  uuid := '00000000-0000-4000-a000-000000b70004';
  client2 uuid := '00000000-0000-4000-a000-000000b70005';
  v_rules jsonb := (select jsonb_agg(jsonb_build_object('weekday', d, 'start_hour', 0, 'end_hour', 24)) from generate_series(1, 7) d);
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_day   date := (now() at time zone 'Europe/Paris')::date + 3;
  v_noon  timestamptz;
  v_two   timestamptz;
  v_three timestamptz;
  v_next  timestamptz;
  v_j     jsonb;
  v_id    uuid;
  v_state text;
  v_n     int;
begin
  v_noon  := (v_day + time '12:00') at time zone 'Europe/Paris';
  v_two   := (v_day + time '14:00') at time zone 'Europe/Paris';
  v_three := (v_day + time '15:00') at time zone 'Europe/Paris';
  v_next  := (v_day + 1 + time '12:00') at time zone 'Europe/Paris';

  update private.glowbook_booking_switch set enabled = true;
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
    (artist,  'authenticated', 'authenticated', 'clo-artist.test@example.invalid',  now(), now(), now()),
    (other,   'authenticated', 'authenticated', 'clo-other.test@example.invalid',   now(), now(), now()),
    (m_none,  'authenticated', 'authenticated', 'clo-none.test@example.invalid',    now(), now(), now()),
    (client,  'authenticated', 'authenticated', 'clo-client.test@example.invalid',  now(), now(), now()),
    (client2, 'authenticated', 'authenticated', 'clo-client2.test@example.invalid', now(), now(), now());
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end) values
    (artist, 'atelier', 'active', 'sub_clo_artist', now() + interval '1 month'),
    (other,  'atelier', 'active', 'sub_clo_other',  now() + interval '1 month'),
    (client, 'atelier', 'active', 'sub_clo_client', now() + interval '1 month');
  insert into public.studio_showcases (user_id, handle, display_name, status) values
    (artist, 'clo-artist', 'Clo Artist', 'approved'),
    (other,  'clo-other',  'Clo Other',  'approved');

  -- C1
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_state := null;
  begin
    perform public.glowbook_add_closure(v_day, v_day, null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C1: anon added a period (%)', v_state; end if;

  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', m_none, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.glowbook_add_closure(v_day, v_day, null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C1: a member without the plan added a period (%)', v_state; end if;

  -- The client holds the plan but has no Glowbook.
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', client, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.glowbook_add_closure(v_day, v_day, null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C1: a member without a Glowbook added a period (%)', v_state; end if;
  v_state := null;
  begin
    perform 1 from public.glowbook_closures;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL C1: members read the table (%)', v_state; end if;

  -- The artist opens the calendar; the client books noon on the day to close.
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  perform public.glowbook_save_booking_settings(true, 'Europe/Paris', 1, 30, v_rules);
  perform public.glowbook_set_calendar_hours(array[v_three], 'open');
  execute 'reset role';
  perform set_config('role', 'service_role', true);
  perform public.glowbook_book_slot(client, 'clo-artist', v_noon, null, 'Client', '0600000000', 'Idea', 'fr');

  -- C2
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.glowbook_add_closure(v_today - 1, v_day, null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL C2: a past start accepted (%)', v_state; end if;
  v_state := null;
  begin
    perform public.glowbook_add_closure(v_day, v_day - 1, null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL C2: an end before the start accepted (%)', v_state; end if;
  v_state := null;
  begin
    perform public.glowbook_add_closure(v_today, v_today + 400, null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL C2: a period too long accepted (%)', v_state; end if;
  v_state := null;
  begin
    perform public.glowbook_add_closure(v_day, v_day, repeat('x', 81));
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL C2: a note too long accepted (%)', v_state; end if;

  -- C3
  v_j := public.glowbook_add_closure(v_day, v_day, '  Holidays  ');
  v_id := (v_j ->> 'id')::uuid;
  if (v_j ->> 'bookings')::int <> 1 then raise exception 'FAIL C3: % appointments counted (expected 1)', v_j ->> 'bookings'; end if;
  execute 'reset role';
  if (select note from public.glowbook_closures where id = v_id) <> 'Holidays' then raise exception 'FAIL C3: note not trimmed'; end if;
  if not exists (select 1 from public.glowbook_bookings where artist_id = artist and starts_at = v_noon and status = 'booked') then
    raise exception 'FAIL C3: the appointment in the period was touched';
  end if;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_j := public.glowbook_booking_slots('clo-artist', v_day - 1, v_day + 1);
  if (v_j -> 'slots') @> to_jsonb(array[v_two]) or (v_j -> 'slots') @> to_jsonb(array[v_three]) then
    raise exception 'FAIL C3: a closed day still offers an hour';
  end if;
  if not (v_j -> 'slots') @> to_jsonb(array[v_next]) then raise exception 'FAIL C3: the next day lost its hours'; end if;
  execute 'reset role';
  perform set_config('role', 'service_role', true);
  v_state := null;
  begin
    perform public.glowbook_book_slot(client2, 'clo-artist', v_two, null, 'Client 2', '0600000001', 'Idea', 'fr');
  exception when others then v_state := sqlerrm;
  end;
  if v_state is distinct from 'glowbook_booking: slot_unavailable' then raise exception 'FAIL C3: a closed day took a booking (%)', v_state; end if;

  -- C4
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  v_j := public.glowbook_artist_calendar(v_today, v_today + 7);
  if v_j ->> 'page_status' <> 'approved' then raise exception 'FAIL C4: page state %', v_j ->> 'page_status'; end if;
  if jsonb_array_length(v_j -> 'closures') <> 1 or (v_j -> 'closures' -> 0 ->> 'bookings')::int <> 1
     or v_j -> 'closures' -> 0 ->> 'note' <> 'Holidays' then
    raise exception 'FAIL C4: closures %', v_j -> 'closures';
  end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', other, 'role', 'authenticated')::text, true);
  if jsonb_array_length(public.glowbook_artist_calendar(v_today, v_today + 7) -> 'closures') <> 0 then
    raise exception 'FAIL C4: another artist reads the period';
  end if;
  v_state := null;
  begin
    perform public.glowbook_delete_closure(v_id);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL C4: another artist deleted the period (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', client, 'role', 'authenticated')::text, true);
  if public.glowbook_artist_calendar(v_today, v_today + 7) ->> 'page_status' is not null then
    raise exception 'FAIL C4: a member without a page has a page state';
  end if;

  -- C5: 19 more, then the 21st is refused.
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  for v_n in 1..19 loop
    perform public.glowbook_add_closure(v_today + 10 + v_n, v_today + 10 + v_n, null);
  end loop;
  v_state := null;
  begin
    perform public.glowbook_add_closure(v_today + 40, v_today + 40, null);
  exception when others then v_state := sqlerrm;
  end;
  if v_state is distinct from 'glowbook_booking: too_many_closures' then raise exception 'FAIL C5: a 21st period accepted (%)', v_state; end if;

  -- C6
  perform public.glowbook_delete_closure(v_id);
  execute 'reset role';
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_j := public.glowbook_booking_slots('clo-artist', v_day - 1, v_day + 1);
  if not (v_j -> 'slots') @> to_jsonb(array[v_two]) or not (v_j -> 'slots') @> to_jsonb(array[v_three]) then
    raise exception 'FAIL C6: the hours did not come back';
  end if;

  -- C7
  execute 'reset role';
  insert into public.glowbook_closures (user_id, starts_on, ends_on) values
    (artist, v_today - 50, v_today - 40),
    (artist, v_today - 20, v_today - 10);
  perform private.purge_glowbook_bookings(now());
  if exists (select 1 from public.glowbook_closures where user_id = artist and ends_on = v_today - 40) then
    raise exception 'FAIL C7: a period ended 40 days ago survived the purge';
  end if;
  if not exists (select 1 from public.glowbook_closures where user_id = artist and ends_on = v_today - 10) then
    raise exception 'FAIL C7: a period ended 10 days ago was purged';
  end if;

  -- C8
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  v_j := public.my_personal_data();
  if jsonb_array_length(v_j -> 'archive' -> 'glowbook_bookings' -> 'closures') < 20 then
    raise exception 'FAIL C8: the export lists % periods', jsonb_array_length(v_j -> 'archive' -> 'glowbook_bookings' -> 'closures');
  end if;
  if (v_j -> 'archive' -> 'glowbook_bookings' -> 'closures' -> 0) ? 'user_id' then raise exception 'FAIL C8: the export leaks user_id'; end if;
  execute 'reset role';

  raise exception 'ALL GLOWBOOK CLOSURES TESTS PASSED';
end;
$$;
