-- =============================================================================
-- Glowbook calendar import validation suite (decision 144, lot 3)
-- (migrations 20261114102854_glowbook_calendar_import, 20261114103044_glowbook_calendar_import_url_check)
-- =============================================================================
--   I1  anon and a member without the plan cannot set an address; a non-https
--       address is refused; webcal:// becomes https://;
--   I2  the service role lists the artist as a target and applies busy hours:
--       they close the slots; a manual choice wins; a booking is untouched;
--   I3  a failed read keeps the previous hours and records the error; an
--       address changed meanwhile is ignored;
--   I4  members cannot call the target / apply functions; the artist reads
--       their state and imported hours, another member nothing;
--   I5  removing the address removes the imported hours.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL GLOWBOOK CALENDAR IMPORT TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  artist  uuid := '00000000-0000-4000-a000-000000b60001';
  m_none  uuid := '00000000-0000-4000-a000-000000b60002';
  client  uuid := '00000000-0000-4000-a000-000000b60003';
  v_rules jsonb := (select jsonb_agg(jsonb_build_object('weekday', d, 'start_hour', 0, 'end_hour', 24)) from generate_series(1, 7) d);
  base    timestamptz := date_trunc('hour', now()) + interval '48 hours';
  v_url   text := 'https://calendar.example.com/private/basic.ics';
  v_j     jsonb;
  v_state text;
  v_n     int;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
    (artist, 'authenticated', 'authenticated', 'imp-artist.test@example.invalid', now(), now(), now()),
    (m_none, 'authenticated', 'authenticated', 'imp-none.test@example.invalid',   now(), now(), now()),
    (client, 'authenticated', 'authenticated', 'imp-client.test@example.invalid', now(), now(), now());
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end) values
    (artist, 'atelier', 'active', 'sub_imp_artist', now() + interval '1 month');
  insert into public.studio_showcases (user_id, handle, display_name, status) values (artist, 'imp-artist', 'Imp Artist', 'approved');

  -- I1
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_state := null;
  begin
    perform public.glowbook_set_calendar_import(v_url);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL I1: anon set an address (%)', v_state; end if;
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', m_none, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.glowbook_set_calendar_import(v_url);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL I1: a member without the plan set an address (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  perform public.glowbook_save_booking_settings(true, 'Europe/Paris', 1, 30, v_rules);
  v_state := null;
  begin
    perform public.glowbook_set_calendar_import('http://calendar.example.com/x.ics');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL I1: http accepted (%)', v_state; end if;
  perform public.glowbook_set_calendar_import('webcal://calendar.example.com/private/basic.ics');
  if public.glowbook_calendar_import_state() ->> 'url' <> v_url then raise exception 'FAIL I1: webcal not turned into https'; end if;

  -- I4: members cannot run the job's functions.
  v_state := null;
  begin
    perform public.glowbook_calendar_import_targets(10);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL I4: a member listed the targets (%)', v_state; end if;
  v_state := null;
  begin
    perform public.glowbook_apply_calendar_import(artist, v_url, array[base], null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL I4: a member applied an import (%)', v_state; end if;

  -- A manual choice before the import, and a booking.
  perform public.glowbook_set_calendar_hours(array[base + interval '2 hours'], 'open');
  execute 'reset role';
  perform set_config('role', 'service_role', true);
  perform public.glowbook_book_slot(client, 'imp-artist', base + interval '3 hours', null, 'Client', '0600000000', 'Idea', 'fr');

  -- I2
  if not exists (select 1 from public.glowbook_calendar_import_targets(100) t where t.user_id = artist and t.url = v_url) then
    raise exception 'FAIL I2: the artist is not a target';
  end if;
  v_n := public.glowbook_apply_calendar_import(artist, v_url, array[base, base + interval '1 hour', base + interval '2 hours', base + interval '3 hours'], null);
  if v_n <> 3 then raise exception 'FAIL I2: % hours imported (expected 3: the manual one kept)', v_n; end if;
  if exists (select 1 from public.glowbook_calendar_overrides where user_id = artist and starts_at = base + interval '2 hours' and source = 'import') then
    raise exception 'FAIL I2: the import overwrote a manual choice';
  end if;
  if not exists (select 1 from public.glowbook_bookings where artist_id = artist and starts_at = base + interval '3 hours' and status = 'booked') then
    raise exception 'FAIL I2: the import touched a booking';
  end if;
  execute 'reset role';
  perform set_config('role', 'anon', true);
  v_j := public.glowbook_booking_slots('imp-artist', null, null);
  if (v_j -> 'slots') @> to_jsonb(array[base]) or (v_j -> 'slots') @> to_jsonb(array[base + interval '1 hour']) then
    raise exception 'FAIL I2: a busy hour is still offered';
  end if;
  if not (v_j -> 'slots') @> to_jsonb(array[base + interval '2 hours']) then raise exception 'FAIL I2: the manually opened hour is gone'; end if;

  -- I3
  execute 'reset role';
  perform set_config('role', 'service_role', true);
  perform public.glowbook_apply_calendar_import(artist, v_url, null, 'timeout');
  if (select count(*) from public.glowbook_calendar_overrides where user_id = artist and source = 'import') <> 3 then
    raise exception 'FAIL I3: a failed read dropped the hours';
  end if;
  if (select import_error from public.glowbook_booking_settings where user_id = artist) <> 'timeout' then raise exception 'FAIL I3: error not recorded'; end if;
  if public.glowbook_apply_calendar_import(artist, 'https://other.example.com/x.ics', array[base + interval '5 hours'], null) <> 0 then
    raise exception 'FAIL I3: an outdated address was applied';
  end if;

  -- I4: the artist reads, another member does not.
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  if jsonb_array_length(public.glowbook_imported_hours(base - interval '1 day', base + interval '7 days')) <> 3 then
    raise exception 'FAIL I4: the artist does not read their imported hours';
  end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', client, 'role', 'authenticated')::text, true);
  if jsonb_array_length(public.glowbook_imported_hours(base - interval '1 day', base + interval '7 days')) <> 0
     or public.glowbook_calendar_import_state() is not null then
    raise exception 'FAIL I4: another member reads the import';
  end if;

  -- I5
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  perform public.glowbook_set_calendar_import(null);
  execute 'reset role';
  if exists (select 1 from public.glowbook_calendar_overrides where user_id = artist and source = 'import') then
    raise exception 'FAIL I5: imported hours survived the address removal';
  end if;
  if not exists (select 1 from public.glowbook_calendar_overrides where user_id = artist and source = 'manual') then
    raise exception 'FAIL I5: the manual choice went with them';
  end if;

  raise exception 'ALL GLOWBOOK CALENDAR IMPORT TESTS PASSED';
end;
$$;
