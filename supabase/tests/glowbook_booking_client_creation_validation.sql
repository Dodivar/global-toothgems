-- =============================================================================
-- Glowbook booking with the client's own Studio creation (decision 149)
-- (migration 20261115205913_glowbook_booking_client_creation)
-- =============================================================================
-- Proves, as the roles that really call them:
--
--   CC1 the service role books for a client with their own creation: kind
--       'client_creation', the creation's name kept, no comment needed;
--   CC2 someone else's creation is refused (creation_unavailable), as is a
--       Glowbook creation and a client creation at once (invalid); the former
--       eight-argument call still books a custom design;
--   CC3 the artist's calendar flags the joined creation; the artist and the
--       client read it through glowbook_booking_creation() (Gem Group links
--       dropped); another member reads nothing; anon cannot call it;
--   CC4 once the artist cancels, the artist no longer reads it (the client
--       still does);
--   CC5 a deleted creation leaves the booking, without the design.
--
-- ONE transaction, ALWAYS rolled back by raising
-- `ALL GLOWBOOK CLIENT CREATION TESTS PASSED` (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  artist  uuid := '00000000-0000-4000-a000-000000c80001';
  c1      uuid := '00000000-0000-4000-a000-000000c80002';
  c2      uuid := '00000000-0000-4000-a000-000000c80003';
  v_rules jsonb := (select jsonb_agg(jsonb_build_object('weekday', d, 'start_hour', 0, 'end_hour', 24)) from generate_series(1, 7) d);
  base    timestamptz := date_trunc('hour', now()) + interval '48 hours';
  v_scene jsonb := jsonb_build_object('version', 2, 'model', 'dentition', 'lightPreset', 'studio', 'camera', null,
                     'pieces', jsonb_build_array('{"productId":"solitaire","ss":5,"look":{"shape":"round","material":"crystal","color":"#ffffff","effect":"none"},"rotation":0,"at":{"x":0,"y":0,"z":0},"facing":{"x":0,"y":0,"z":1}}'::jsonb),
                     'groups', jsonb_build_array(jsonb_build_object('id', 'g1', 'gemGroupId', 'abc')));
  own1    uuid;
  own2    uuid;
  item    uuid;
  b1      uuid;
  b2      uuid;
  v_j     jsonb;
  v_msg   text;
  v_state text;
  v_row   public.glowbook_bookings;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
    (artist, 'authenticated', 'authenticated', 'cc-artist.test@example.invalid', now(), now(), now()),
    (c1,     'authenticated', 'authenticated', 'cc-c1.test@example.invalid',     now(), now(), now()),
    (c2,     'authenticated', 'authenticated', 'cc-c2.test@example.invalid',     now(), now(), now());
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end) values
    (artist, 'atelier',   'active', 'sub_cc_artist', now() + interval '1 month'),
    (c1,     'essential', 'active', 'sub_cc_c1',     now() + interval '1 month'),
    (c2,     'essential', 'active', 'sub_cc_c2',     now() + interval '1 month');

  insert into public.studio_showcases (user_id, handle, display_name, status) values (artist, 'cc-artist', 'Artist C', 'approved');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  insert into public.creations (name, scene_data) values ('Showcase', v_scene) returning id into item;
  perform public.glowbook_save_booking_settings(true, 'Europe/Paris', 1, 30, v_rules);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', c1, 'role', 'authenticated')::text, true);
  insert into public.creations (name, scene_data) values ('My smile', v_scene) returning id into own1;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', c2, 'role', 'authenticated')::text, true);
  insert into public.creations (name, scene_data) values ('Not yours', v_scene) returning id into own2;
  execute 'reset role';
  insert into public.studio_showcase_items (user_id, creation_id, status) values (artist, item, 'approved') returning id into item;
  update private.glowbook_booking_switch set enabled = true;

  -- CC1 --------------------------------------------------------------------
  perform set_config('role', 'service_role', true);
  v_j := public.glowbook_book_slot(c1, 'cc-artist', base, null, 'Client One', '+33 6 00 00 00 01', null, 'fr', own1);
  b1 := (v_j ->> 'id')::uuid;
  execute 'reset role';
  select * into v_row from public.glowbook_bookings where id = b1;
  if v_row.design_kind is distinct from 'client_creation' or v_row.client_creation_id is distinct from own1
     or v_row.creation_name is distinct from 'My smile' or v_row.comment is not null then
    raise exception 'FAIL CC1: booking with the client creation is wrong (%, %, %)', v_row.design_kind, v_row.creation_name, v_row.comment;
  end if;

  -- CC2 --------------------------------------------------------------------
  perform set_config('role', 'service_role', true);
  v_msg := null;
  begin
    perform public.glowbook_book_slot(c2, 'cc-artist', base + interval '2 hours', null, 'Two', '0600000002', null, 'fr', own1);
  exception when others then get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is distinct from 'glowbook_booking: creation_unavailable' then raise exception 'FAIL CC2: another client''s creation (%)', v_msg; end if;
  v_state := null;
  begin
    perform public.glowbook_book_slot(c2, 'cc-artist', base + interval '2 hours', item, 'Two', '0600000002', null, 'fr', own2);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL CC2: both kinds of design accepted (%)', v_state; end if;
  v_j := public.glowbook_book_slot(c2, 'cc-artist', base + interval '2 hours', null, 'Two', '0600000002', 'A custom idea', 'fr');
  b2 := (v_j ->> 'id')::uuid;
  execute 'reset role';
  if (select design_kind from public.glowbook_bookings where id = b2) is distinct from 'custom' then
    raise exception 'FAIL CC2: the eight-argument call did not book a custom design';
  end if;

  -- CC3 --------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  v_j := public.glowbook_artist_calendar((now())::date, (now() + interval '7 days')::date);
  if (select count(*) from jsonb_array_elements(v_j -> 'bookings') e where e ->> 'id' = b1::text and (e ->> 'client_creation')::boolean) <> 1
     or (select count(*) from jsonb_array_elements(v_j -> 'bookings') e where e ->> 'id' = b2::text and (e ->> 'client_creation')::boolean) <> 0 then
    raise exception 'FAIL CC3: the calendar does not flag the joined creation (%)', v_j -> 'bookings';
  end if;
  v_j := public.glowbook_booking_creation(b1);
  if v_j ->> 'name' is distinct from 'My smile' or v_j ->> 'viewer' <> 'artist'
     or v_j #>> '{scene_data,groups,0,gemGroupId}' is not null or jsonb_array_length(v_j #> '{scene_data,pieces}') <> 1 then
    raise exception 'FAIL CC3: the artist does not read the creation (%)', v_j;
  end if;
  if public.glowbook_booking_creation(b2) is not null then raise exception 'FAIL CC3: a custom booking returns a creation'; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', c1, 'role', 'authenticated')::text, true);
  v_j := public.glowbook_booking_creation(b1);
  if v_j ->> 'viewer' is distinct from 'client' then raise exception 'FAIL CC3: the client does not read their creation (%)', v_j; end if;
  v_j := public.my_glowbook_bookings();
  if not (v_j #> '{bookings,0,client_creation}')::boolean or v_j #>> '{bookings,0,design_kind}' <> 'client_creation' then
    raise exception 'FAIL CC3: the client list misses the creation (%)', v_j;
  end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', c2, 'role', 'authenticated')::text, true);
  if public.glowbook_booking_creation(b1) is not null then raise exception 'FAIL CC3: another member reads the creation'; end if;
  execute 'reset role';
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_state := null;
  begin
    perform public.glowbook_booking_creation(b1);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL CC3: anon called glowbook_booking_creation (%)', v_state; end if;
  execute 'reset role';

  -- CC4 --------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', artist, 'role', 'authenticated')::text, true);
  perform public.glowbook_cancel_booking(b1, 'Not available that day');
  if public.glowbook_booking_creation(b1) is not null then raise exception 'FAIL CC4: the artist still reads a cancelled booking''s creation'; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', c1, 'role', 'authenticated')::text, true);
  if public.glowbook_booking_creation(b1) is null then raise exception 'FAIL CC4: the client lost their own creation'; end if;

  -- CC5 --------------------------------------------------------------------
  delete from public.creations where id = own1;
  execute 'reset role';
  select * into v_row from public.glowbook_bookings where id = b1;
  if v_row.id is null or v_row.client_creation_id is not null or v_row.creation_name is distinct from 'My smile' then
    raise exception 'FAIL CC5: deleting the creation broke the booking (%)', v_row;
  end if;

  raise exception 'ALL GLOWBOOK CLIENT CREATION TESTS PASSED';
end;
$$;
