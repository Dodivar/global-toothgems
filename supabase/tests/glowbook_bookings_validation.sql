-- =============================================================================
-- Glowbook booking calendar validation suite (decision 144)
-- (migrations 20261113233819_glowbook_bookings, 20261114084038_glowbook_bookings_personal_data,
-- 20261114084425_glowbook_bookings_updated_at)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   B1  nothing is bookable before the artist switches it on AND the page is
--       approved; a member without the Atelier plan and anon cannot save a
--       calendar; bad settings are refused;
--   B2  the public free hours follow the weekly hours, the overrides, the
--       notice and the horizon; a non-whole hour cannot be overridden;
--   B3  anon and members cannot call the booking function or read the tables;
--   B4  the service role books for a confirmed member: the hour disappears from
--       the free hours, a second booking of it is refused (slot_taken), as are
--       an unconfirmed account, the artist's own calendar, a custom design
--       without a comment, an unapproved creation, a second upcoming booking
--       with the same artist;
--   B5  another member and another artist see nothing of it and cannot cancel
--       it; the client sees it in my_glowbook_bookings;
--   B6  the artist cancels only with a reason; the hour is free again; the
--       e-mails are pending once each (new, confirmed, cancel_artist);
--   B7  a client cancelling less than 24 h before is "late"; 2 late
--       cancellations block bookings; the artist's block refuses the client;
--   B8  an outcome cannot be recorded before the hour; another artist cannot;
--   B9  erasing a client cancels their upcoming booking and clears their
--       details; an artist with upcoming bookings is blocked from erasure;
--   B10 the global switch and the end of the artist's plan close the page;
--       the artist still reads their calendar;
--   B11 the purge removes bookings 12 months after their hour.
--
-- ONE transaction, ALWAYS rolled back by raising `ALL GLOWBOOK BOOKING TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  artist  uuid := '00000000-0000-4000-a000-000000b40001';
  other   uuid := '00000000-0000-4000-a000-000000b40002';
  c1      uuid := '00000000-0000-4000-a000-000000b40003';
  c2      uuid := '00000000-0000-4000-a000-000000b40004';
  c3      uuid := '00000000-0000-4000-a000-000000b40005';
  c_unc   uuid := '00000000-0000-4000-a000-000000b40006';
  m_none  uuid := '00000000-0000-4000-a000-000000b40007';
  v_rules jsonb := (select jsonb_agg(jsonb_build_object('weekday', d, 'start_hour', 0, 'end_hour', 24)) from generate_series(1, 7) d);
  base    timestamptz := date_trunc('hour', now()) + interval '48 hours';
  v_scene jsonb := jsonb_build_object('version', 2, 'model', 'dentition', 'lightPreset', 'studio', 'camera', null,
                     'pieces', jsonb_build_array('{"productId":"solitaire","ss":5,"look":{"shape":"round","material":"crystal","color":"#ffffff","effect":"none"},"rotation":0,"at":{"x":0,"y":0,"z":0},"facing":{"x":0,"y":0,"z":1}}'::jsonb),
                     'groups', '[]'::jsonb);
  c_one   uuid;
  i_one   uuid;
  i_pend  uuid;
  b1      uuid;
  b2      uuid;
  v_j     jsonb;
  v_state text;
  v_msg   text;
  v_case  text;
  v_cnt   int;
  v_row   public.glowbook_bookings;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
    (artist, 'authenticated', 'authenticated', 'bk-artist.test@example.invalid', now(), now(), now()),
    (other,  'authenticated', 'authenticated', 'bk-other.test@example.invalid',  now(), now(), now()),
    (c1,     'authenticated', 'authenticated', 'bk-c1.test@example.invalid',     now(), now(), now()),
    (c2,     'authenticated', 'authenticated', 'bk-c2.test@example.invalid',     now(), now(), now()),
    (c3,     'authenticated', 'authenticated', 'bk-c3.test@example.invalid',     now(), now(), now()),
    (c_unc,  'authenticated', 'authenticated', 'bk-unc.test@example.invalid',    null,  now(), now()),
    (m_none, 'authenticated', 'authenticated', 'bk-none.test@example.invalid',   now(), now(), now());
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end) values
    (artist, 'atelier', 'active', 'sub_bk_artist', now() + interval '1 month'),
    (other,  'atelier', 'active', 'sub_bk_other',  now() + interval '1 month');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  insert into public.creations (name, scene_data) values ('Aurora', v_scene) returning id into c_one;
  insert into public.creations (name, scene_data) values ('Pending', v_scene) returning id into i_pend;
  execute 'reset role';
  insert into public.studio_showcases (user_id, handle, display_name, status) values
    (artist, 'bk-artist', 'Artist B', 'pending'),
    (other,  'bk-other',  'Other B',  'approved');
  insert into public.studio_showcase_items (user_id, creation_id, status) values (artist, c_one, 'approved') returning id into i_one;
  insert into public.studio_showcase_items (user_id, creation_id, status) values (artist, i_pend, 'pending') returning id into i_pend;

  -- B1 ---------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', m_none, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.glowbook_save_booking_settings(true, 'Europe/Paris', 1, 30, v_rules);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B1: a member without the plan saved a calendar (%)', v_state; end if;

  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  foreach v_msg in array array['Mars/Olympus', 'tz'] loop
    v_state := null;
    begin
      perform public.glowbook_save_booking_settings(true, case when v_msg = 'tz' then 'Europe/Paris' else v_msg end,
                                                    case when v_msg = 'tz' then 0 else 1 end, 30, v_rules);
    exception when others then v_state := sqlstate;
    end;
    if v_state is distinct from '22023' then raise exception 'FAIL B1: bad settings (%) accepted (%)', v_msg, v_state; end if;
  end loop;
  v_state := null;
  begin
    perform public.glowbook_save_booking_settings(true, 'Europe/Paris', 1, 30, '[{"weekday":8,"start_hour":0,"end_hour":5}]');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B1: bad rule accepted (%)', v_state; end if;

  perform public.glowbook_save_booking_settings(true, 'Europe/Paris', 1, 30, v_rules);
  execute 'reset role';
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  if public.glowbook_booking_info('bk-artist') is not null then raise exception 'FAIL B1: bookable while the page is pending'; end if;
  v_state := null;
  begin
    perform public.glowbook_save_booking_settings(true, 'Europe/Paris', 1, 30, v_rules);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B1: anon saved a calendar (%)', v_state; end if;
  execute 'reset role';
  update public.studio_showcases set status = 'approved' where user_id = artist;
  perform set_config('role', 'anon', true);
  if public.glowbook_booking_info('bk-artist') is null then raise exception 'FAIL B1: approved and switched on, not bookable'; end if;
  -- "other" never switched it on.
  if public.glowbook_booking_info('bk-other') is not null then raise exception 'FAIL B1: bookable without being switched on'; end if;

  -- B2 ---------------------------------------------------------------------
  v_j := public.glowbook_booking_slots('bk-artist', null, null);
  if not (v_j -> 'slots') @> to_jsonb(array[base]) then raise exception 'FAIL B2: an open hour is not offered'; end if;
  if (v_j -> 'slots') @> to_jsonb(array[date_trunc('hour', now())]) then raise exception 'FAIL B2: an hour inside the notice is offered'; end if;
  v_j := public.glowbook_booking_slots('bk-artist', (now() + interval '40 days')::date, (now() + interval '45 days')::date);
  if jsonb_array_length(v_j -> 'slots') > 0 then raise exception 'FAIL B2: hours beyond the horizon are offered'; end if;
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  perform public.glowbook_set_calendar_hours(array[base + interval '1 hour'], 'blocked');
  v_state := null;
  begin
    perform public.glowbook_set_calendar_hours(array[base + interval '30 minutes'], 'blocked');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B2: a half hour was overridden (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', m_none, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.glowbook_set_calendar_hours(array[base + interval '2 hours'], 'blocked');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B2: a member without the plan set hours (%)', v_state; end if;
  execute 'reset role';
  perform set_config('role', 'anon', true);
  v_j := public.glowbook_booking_slots('bk-artist', null, null);
  if (v_j -> 'slots') @> to_jsonb(array[base + interval '1 hour']) then raise exception 'FAIL B2: a blocked hour is offered'; end if;

  -- B3 ---------------------------------------------------------------------
  v_state := null;
  begin
    perform public.glowbook_book_slot(c1, 'bk-artist', base, i_one, 'Client One', '+33 6 00 00 00 01', null, 'fr');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B3: anon booked (%)', v_state; end if;
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', c1, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.glowbook_book_slot(c1, 'bk-artist', base, i_one, 'Client One', '+33 6 00 00 00 01', null, 'fr');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B3: a member called the booking function directly (%)', v_state; end if;
  v_state := null;
  begin
    perform 1 from public.glowbook_bookings;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B3: a member reads the bookings table (%)', v_state; end if;
  v_state := null;
  begin
    perform 1 from public.glowbook_booking_settings;
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B3: a member reads the settings table (%)', v_state; end if;

  -- B4 ---------------------------------------------------------------------
  execute 'reset role';
  perform set_config('role', 'service_role', true);
  v_j := public.glowbook_book_slot(c1, 'bk-artist', base, i_one, 'Client One', '+33 6 00 00 00 01', 'Small sparkle', 'fr');
  b1 := (v_j ->> 'id')::uuid;
  if b1 is null then raise exception 'FAIL B4: no booking id'; end if;

  foreach v_case in array array['slot_taken', 'email_unconfirmed', 'own_calendar', 'comment_required', 'item_unavailable', 'limit_artist'] loop
    v_msg := null;
    begin
      case v_case
        when 'slot_taken' then perform public.glowbook_book_slot(c2, 'bk-artist', base, null, 'Two', '0600000002', 'Custom idea', 'fr');
        when 'email_unconfirmed' then perform public.glowbook_book_slot(c_unc, 'bk-artist', base + interval '3 hours', null, 'Unc', '0600000009', 'Idea', 'fr');
        when 'own_calendar' then perform public.glowbook_book_slot(artist, 'bk-artist', base + interval '3 hours', null, 'Me', '0600000000', 'Idea', 'fr');
        when 'comment_required' then perform public.glowbook_book_slot(c2, 'bk-artist', base + interval '3 hours', null, 'Two', '0600000002', '  ', 'fr');
        when 'item_unavailable' then perform public.glowbook_book_slot(c2, 'bk-artist', base + interval '3 hours', i_pend, 'Two', '0600000002', null, 'fr');
        when 'limit_artist' then perform public.glowbook_book_slot(c1, 'bk-artist', base + interval '3 hours', null, 'Client One', '0600000001', 'Again', 'fr');
      end case;
    exception when others then get stacked diagnostics v_msg = message_text;
    end;
    if v_msg is distinct from 'glowbook_booking: ' || v_case then
      raise exception 'FAIL B4: expected %, got %', v_case, v_msg;
    end if;
  end loop;

  execute 'reset role';
  perform set_config('role', 'anon', true);
  v_j := public.glowbook_booking_slots('bk-artist', null, null);
  if (v_j -> 'slots') @> to_jsonb(array[base]) then raise exception 'FAIL B4: a booked hour is still offered'; end if;

  -- B5 ---------------------------------------------------------------------
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', other, 'role', 'authenticated')::text, true);
  v_j := public.glowbook_artist_calendar((now())::date, (now() + interval '7 days')::date);
  if jsonb_array_length(v_j -> 'bookings') <> 0 then raise exception 'FAIL B5: another artist sees the bookings'; end if;
  v_state := null;
  begin
    perform public.glowbook_cancel_booking(b1, 'Not mine to cancel');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL B5: another artist cancelled (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', c2, 'role', 'authenticated')::text, true);
  if jsonb_array_length(public.my_glowbook_bookings() -> 'bookings') <> 0 then raise exception 'FAIL B5: another member sees the booking'; end if;
  v_state := null;
  begin
    perform public.glowbook_cancel_booking(b1);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL B5: another member cancelled (%)', v_state; end if;
  v_state := null;
  begin
    perform public.glowbook_block_client(b1);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL B5: another member blocked a client (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', c1, 'role', 'authenticated')::text, true);
  v_j := public.my_glowbook_bookings();
  if jsonb_array_length(v_j -> 'bookings') <> 1 or v_j #>> '{bookings,0,artist_handle}' <> 'bk-artist'
     or v_j #>> '{bookings,0,creation_name}' <> 'Aurora' then
    raise exception 'FAIL B5: the client does not see their booking (%)', v_j;
  end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  v_j := public.glowbook_artist_calendar((now())::date, (now() + interval '7 days')::date);
  if jsonb_array_length(v_j -> 'bookings') <> 1 or v_j #>> '{bookings,0,client_name}' <> 'Client One'
     or v_j #> '{bookings,0}' ? 'client_id' then
    raise exception 'FAIL B5: the artist calendar is wrong (%)', v_j -> 'bookings';
  end if;

  -- B6 ---------------------------------------------------------------------
  v_state := null;
  begin
    perform public.glowbook_cancel_booking(b1, ' ');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL B6: cancelled without a reason (%)', v_state; end if;
  execute 'reset role';
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_glowbook_booking_emails(100, b1) where kind in ('new', 'confirmed');
  if v_cnt <> 2 then raise exception 'FAIL B6: new + confirmed e-mails pending: %', v_cnt; end if;
  select count(*) into v_cnt from public.pending_glowbook_booking_emails(100, b1) where kind = 'new' and reply_to = 'bk-c1.test@example.invalid';
  if v_cnt <> 1 then raise exception 'FAIL B6: the artist e-mail does not reply to the client'; end if;
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  perform public.glowbook_cancel_booking(b1, 'Away that day');
  execute 'reset role';
  select * into v_row from public.glowbook_bookings where id = b1;
  if v_row.status <> 'cancelled_artist' or v_row.cancel_reason <> 'Away that day' then raise exception 'FAIL B6: not cancelled by the artist'; end if;
  perform set_config('role', 'service_role', true);
  select count(*) into v_cnt from public.pending_glowbook_booking_emails(100, b1) where kind = 'cancel_artist' and email = 'bk-c1.test@example.invalid';
  if v_cnt <> 1 then raise exception 'FAIL B6: no cancellation e-mail for the client'; end if;
  select count(*) into v_cnt from public.pending_glowbook_booking_emails(100, b1) where kind in ('new', 'confirmed');
  if v_cnt <> 0 then raise exception 'FAIL B6: a cancelled booking still announces itself'; end if;
  -- The hour is free again: c2 books it (custom design).
  v_j := public.glowbook_book_slot(c2, 'bk-artist', base, null, 'Client Two', '0600000002', 'A star on the left incisor', 'en');
  b2 := (v_j ->> 'id')::uuid;

  -- B7 ---------------------------------------------------------------------
  -- Two late cancellations by c3 (made directly: bookings less than 24 h ahead).
  execute 'reset role';
  insert into public.glowbook_bookings (artist_id, client_id, starts_at, timezone, design_kind, client_name, client_email, client_phone,
                                        comment, status, late_cancel, cancelled_at, created_at)
  values (other, c3, now() - interval '20 days', 'Europe/Paris', 'custom', 'C3', 'bk-c3.test@example.invalid', '0600000003', 'x',
          'cancelled_client', true, now() - interval '21 days', now() - interval '30 days');
  perform set_config('role', 'service_role', true);
  -- One strike: still free to book (then cancel late).
  v_j := public.glowbook_book_slot(c3, 'bk-artist', base + interval '5 hours', null, 'C3', '0600000003', 'Idea', 'fr');
  execute 'reset role';
  update public.glowbook_bookings set starts_at = date_trunc('hour', now()) + interval '3 hours' where id = (v_j ->> 'id')::uuid;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', c3, 'role', 'authenticated')::text, true);
  v_j := public.glowbook_cancel_booking((v_j ->> 'id')::uuid);
  if (v_j ->> 'late')::boolean is not true then raise exception 'FAIL B7: a cancellation 3 h before is not late'; end if;
  if public.my_glowbook_bookings() ->> 'banned_until' is null then raise exception 'FAIL B7: 2 late cancellations do not block'; end if;
  execute 'reset role';
  perform set_config('role', 'service_role', true);
  v_msg := null;
  begin
    perform public.glowbook_book_slot(c3, 'bk-artist', base + interval '6 hours', null, 'C3', '0600000003', 'Idea', 'fr');
  exception when others then get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is distinct from 'glowbook_booking: banned' then raise exception 'FAIL B7: a blocked client booked (%)', v_msg; end if;
  -- The artist blocks c2.
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  perform public.glowbook_block_client(b2);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', c2, 'role', 'authenticated')::text, true);
  perform public.glowbook_cancel_booking(b2);
  execute 'reset role';
  perform set_config('role', 'service_role', true);
  v_msg := null;
  begin
    perform public.glowbook_book_slot(c2, 'bk-artist', base + interval '7 hours', null, 'Two', '0600000002', 'Idea', 'fr');
  exception when others then get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is distinct from 'glowbook_booking: blocked' then raise exception 'FAIL B7: a blocked client booked (%)', v_msg; end if;
  select count(*) into v_cnt from public.pending_glowbook_booking_emails(100, b2) where kind = 'cancel_client';
  if v_cnt <> 1 then raise exception 'FAIL B7: no e-mail to the artist when the client cancels'; end if;

  -- B8 ---------------------------------------------------------------------
  v_j := public.glowbook_book_slot(c1, 'bk-artist', base + interval '8 hours', i_one, 'Client One', '0600000001', null, 'fr');
  b1 := (v_j ->> 'id')::uuid;
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.glowbook_mark_booking(b1, 'no_show');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '23514' then raise exception 'FAIL B8: no-show recorded before the hour (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', other, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.glowbook_mark_booking(b1, 'honoured');
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL B8: another artist recorded an outcome (%)', v_state; end if;

  -- B9 ---------------------------------------------------------------------
  execute 'reset role';
  if not ('glowbook_bookings' = any (private.account_erasure_blockers(artist))) then
    raise exception 'FAIL B9: an artist with upcoming bookings may erase their account';
  end if;
  delete from auth.users where id = c1;
  select * into v_row from public.glowbook_bookings where id = b1;
  if v_row.status <> 'cancelled_client' or not v_row.client_erased or v_row.client_name is not null
     or v_row.client_email is not null or v_row.client_phone is not null or v_row.client_id is not null then
    raise exception 'FAIL B9: erasing the client left the booking as it was (%)', row_to_json(v_row);
  end if;

  -- B10 --------------------------------------------------------------------
  update private.glowbook_booking_switch set enabled = false;
  if public.glowbook_booking_info('bk-artist') is not null then raise exception 'FAIL B10: the global switch does not close'; end if;
  update private.glowbook_booking_switch set enabled = true;
  update public.studio_subscriptions set status = 'canceled' where user_id = artist;
  if public.glowbook_booking_info('bk-artist') is not null then raise exception 'FAIL B10: open without the plan'; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  v_j := public.glowbook_artist_calendar((now())::date, (now() + interval '7 days')::date);
  if jsonb_array_length(v_j -> 'bookings') < 1 then raise exception 'FAIL B10: the artist lost their calendar with the plan'; end if;
  v_state := null;
  begin
    perform public.glowbook_save_booking_settings(true, 'Europe/Paris', 1, 30, v_rules);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL B10: settings saved without the plan (%)', v_state; end if;

  -- B11 --------------------------------------------------------------------
  execute 'reset role';
  insert into public.glowbook_bookings (artist_id, client_id, starts_at, timezone, design_kind, client_name, client_email, client_phone, comment)
  values (other, c2, now() - interval '13 months', 'Europe/Paris', 'custom', 'Old', 'bk-c2.test@example.invalid', '0600000002', 'old');
  v_j := private.purge_glowbook_bookings(now());
  if (v_j ->> 'bookings')::int < 1 then raise exception 'FAIL B11: the purge kept an old booking'; end if;
  if exists (select 1 from public.glowbook_bookings where starts_at < now() - interval '12 months') then
    raise exception 'FAIL B11: an old booking survived the purge';
  end if;

  raise exception 'ALL GLOWBOOK BOOKING TESTS PASSED';
end;
$$;
