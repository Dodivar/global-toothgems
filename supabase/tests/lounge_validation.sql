-- =============================================================================
-- Members' Lounge validation suite (migration `…_members_lounge`).
-- =============================================================================
-- Requires all migrations. ONE transaction, ALWAYS rolled back by raising
-- `ALL LOUNGE TESTS PASSED` (or `FAIL: ...`).
-- Covers: the door (course holder, staff, no course, suspended), handles and the
-- directory (no personal data), posting rules (no impersonation, mentions of
-- members only, replies in their room, empty/invalid/too long, rate limit),
-- private conversations (third party and staff refused), reactions and their
-- totals, notifications, overview and read state, attachments and their storage
-- policies.
-- =============================================================================

do $$
declare
  a     uuid := '00000000-0000-4000-a000-000000250001';  -- holder
  b     uuid := '00000000-0000-4000-a000-000000250002';  -- holder
  c     uuid := '00000000-0000-4000-a000-000000250003';  -- holder, same name as a
  outsider uuid := '00000000-0000-4000-a000-000000250004';  -- no course
  sus   uuid := '00000000-0000-4000-a000-000000250005';  -- holder, suspended
  stf   uuid := '00000000-0000-4000-a000-000000250006';  -- staff, no course
  crs   uuid := '00000000-0000-4000-a000-0000002500c1';
  m1    uuid;  -- a in en-general, mentions b
  m2    uuid;
  dm1   uuid;  -- a → b
  v     jsonb;
  v_cnt int;
  v_txt text;
  v_ok  boolean;
  i     int;
  passed text[] := '{}';
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at) values
    (a,   'authenticated', 'authenticated', 'lounge25a.test@example.invalid', now(), now()),
    (b,   'authenticated', 'authenticated', 'lounge25b.test@example.invalid', now(), now()),
    (c,   'authenticated', 'authenticated', 'lounge25c.test@example.invalid', now(), now()),
    (outsider, 'authenticated', 'authenticated', 'lounge25o.test@example.invalid', now(), now()),
    (sus, 'authenticated', 'authenticated', 'lounge25s.test@example.invalid', now(), now()),
    (stf, 'authenticated', 'authenticated', 'lounge25t.test@example.invalid', now(), now());
  update public.profiles set first_name = 'Émma', last_name = 'Martin', preferred_locale = 'fr' where id = a;
  update public.profiles set first_name = 'Lucas', last_name = 'Bernard' where id = b;
  update public.profiles set first_name = 'Emma', last_name = 'Martin' where id = c;
  update public.profiles set first_name = 'Out', last_name = 'Sider' where id = outsider;
  update public.profiles set role = 'manager' where id = stf;

  insert into public.courses (id, slug, title, status, published_at) values (crs, 'lounge-test-25', 'Fondamentaux', 'draft', null);
  insert into public.course_entitlements (user_id, course_id, source, granted_by)
  select u, crs, 'manual_grant', stf from unnest(array[a, b, c, sus]) as u;
  insert into public.course_completions (user_id, course_id, average_score, min_score) values (a, crs, 90, 70);

  -- A1: the door ----------------------------------------------------------------------
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  if public.lounge_access() then raise exception 'FAIL A1: a member without course may enter'; end if;
  begin
    perform public.lounge_join(null);
    raise exception 'FAIL A1: join without course';
  exception when insufficient_privilege then null;
  end;
  select count(*) into v_cnt from public.lounge_channels;
  if v_cnt <> 0 then raise exception 'FAIL A1: outsider reads channels'; end if;
  begin
    perform public.lounge_directory();
    raise exception 'FAIL A1: outsider reads the directory';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claims', json_build_object('sub', stf, 'role', 'authenticated')::text, true);
  if not public.lounge_access() then raise exception 'FAIL A1: staff refused'; end if;
  perform public.lounge_join('en');

  reset role;
  update public.profiles set status = 'suspended' where id = sus;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sus, 'role', 'authenticated')::text, true);
  if public.lounge_access() then raise exception 'FAIL A1: suspended member may enter'; end if;
  passed := passed || 'A1'::text;

  -- J1: joining, handles ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.lounge_join('en');
  select handle into v_txt from public.lounge_members where user_id = a;
  if v_txt <> 'emma.m' then raise exception 'FAIL J1: handle %', v_txt; end if;
  select count(*) into v_cnt from public.lounge_members where user_id = a and languages @> array['fr', 'en'];
  if v_cnt <> 1 then raise exception 'FAIL J1: lounges of the member'; end if;
  begin
    perform public.lounge_join('xx');
    raise exception 'FAIL J1: unknown lounge accepted';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.lounge_join('en');
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.lounge_join('en');
  select handle into v_txt from public.lounge_members where user_id = c;
  if v_txt <> 'emma.m2' then raise exception 'FAIL J1: second handle %', v_txt; end if;
  select count(*) into v_cnt from public.lounge_members;
  if v_cnt <> 1 then raise exception 'FAIL J1: a member reads other lounge rows (%)', v_cnt; end if;
  passed := passed || 'J1'::text;

  -- Messages written in this transaction share now(): joined an hour earlier.
  reset role;
  update public.lounge_members set joined_at = now() - interval '1 hour' where user_id in (a, b, c, stf);
  perform set_config('role', 'authenticated', true);

  -- D0: directory, no personal data ------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select to_jsonb(d) into v from public.lounge_directory() d where d.user_id = a;
  if v ->> 'display_name' <> 'Émma M.' then raise exception 'FAIL D0: display name %', v ->> 'display_name'; end if;
  if v ? 'email' or v ? 'phone' or v ? 'last_name' then raise exception 'FAIL D0: personal data in the directory'; end if;
  if (v -> 'trainings') <> '["Fondamentaux"]'::jsonb then raise exception 'FAIL D0: trainings %', v -> 'trainings'; end if;
  if v ->> 'role' <> 'new' or not (v ->> 'active')::boolean then raise exception 'FAIL D0: role/active %', v; end if;
  select to_jsonb(d) into v from public.lounge_directory() d where d.user_id = stf;
  if v ->> 'role' <> 'team' then raise exception 'FAIL D0: staff badge'; end if;
  select count(*) into v_cnt from public.lounge_directory() d where d.user_id = outsider;
  if v_cnt <> 0 then raise exception 'FAIL D0: outsider listed'; end if;
  select count(*) into v_cnt from public.profiles where id = a;
  if v_cnt <> 0 then raise exception 'FAIL D0: a member reads another profile'; end if;
  passed := passed || 'D0'::text;

  -- P1: posting in a channel, mentions ------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  m1 := public.lounge_post_message('en-general', null,
    jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'Hello '), jsonb_build_object('type', 'mention', 'memberId', b)));
  select author_id::text into v_txt from public.lounge_messages where id = m1;
  if v_txt <> a::text then raise exception 'FAIL P1: author'; end if;
  select count(*) into v_cnt from public.lounge_messages where id = m1 and mention_ids = array[b];
  if v_cnt <> 1 then raise exception 'FAIL P1: mention ids'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_notifications where user_id = b and kind = 'mention' and message_id = m1 and read_at is null;
  if v_cnt <> 1 then raise exception 'FAIL P1: mention notification'; end if;
  passed := passed || 'P1'::text;

  -- P2: no impersonation, no direct writes --------------------------------------------------
  begin
    insert into public.lounge_messages (channel_id, author_id, parts) values ('en-general', a, '[]');
    raise exception 'FAIL P2: direct insert';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.lounge_messages set reactions = '{"heart": 99}' where id = m1;
    raise exception 'FAIL P2: direct update';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lounge_notifications (user_id, kind, message_id) values (a, 'mention', m1);
    raise exception 'FAIL P2: forged notification';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'P2'::text;

  -- P3: replies stay in their room; invalid content refused ---------------------------------
  begin
    perform public.lounge_post_message('fr-general', null, '[{"type":"text","text":"x"}]', m1);
    raise exception 'FAIL P3: reply across rooms';
  exception when invalid_parameter_value then null;
  end;
  m2 := public.lounge_post_message('en-general', null, '[{"type":"text","text":"Thanks!"}]', m1);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_notifications where user_id = a and kind = 'reply' and message_id = m2;
  if v_cnt <> 1 then raise exception 'FAIL P3: reply notification'; end if;
  begin
    perform public.lounge_post_message('en-general', null, jsonb_build_array(jsonb_build_object('type', 'mention', 'memberId', outsider)));
    raise exception 'FAIL P3: mention of a non-member';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_post_message('en-general', null, '[{"type":"text","text":"  "}]');
    raise exception 'FAIL P3: empty message';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_post_message('en-general', null, '[{"type":"html","text":"<b>x</b>"}]');
    raise exception 'FAIL P3: unknown part';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_post_message('en-general', null, '[{"type":"text","text":"x","authorId":"me"}]');
    raise exception 'FAIL P3: extra keys';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_post_message('en-general', null, jsonb_build_array(jsonb_build_object('type', 'text', 'text', repeat('a', 4001))));
    raise exception 'FAIL P3: too long';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_post_message('xx-general', null, '[{"type":"text","text":"x"}]');
    raise exception 'FAIL P3: unknown channel';
  exception when invalid_parameter_value then null;
  end;
  passed := passed || 'P3'::text;

  -- C1: private conversations ---------------------------------------------------------------
  dm1 := public.lounge_post_message(null, b, '[{"type":"text","text":"Private hello"}]');
  begin
    perform public.lounge_post_message(null, outsider, '[{"type":"text","text":"x"}]');
    raise exception 'FAIL C1: DM to a non-member';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_post_message(null, a, '[{"type":"text","text":"x"}]');
    raise exception 'FAIL C1: DM to oneself';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_messages where id = dm1;
  if v_cnt <> 1 then raise exception 'FAIL C1: recipient cannot read'; end if;
  v := public.lounge_overview();
  if (select (x ->> 'unread')::int from jsonb_array_elements(v -> 'conversations') x where x ->> 'member_id' = a::text) <> 1 then
    raise exception 'FAIL C1: DM unread %', v -> 'conversations';
  end if;
  foreach v_txt in array array[c::text, stf::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_txt, 'role', 'authenticated')::text, true);
    select count(*) into v_cnt from public.lounge_messages where id = dm1;
    if v_cnt <> 0 then raise exception 'FAIL C1: % reads the DM', v_txt; end if;
    select count(*) into v_cnt from public.lounge_conversations;
    if v_cnt <> 0 then raise exception 'FAIL C1: % sees the conversation', v_txt; end if;
    begin
      perform public.lounge_toggle_reaction(dm1, 'heart');
      raise exception 'FAIL C1: % reacts to the DM', v_txt;
    exception when invalid_parameter_value then null;
    end;
    begin
      perform public.lounge_post_message(null, b, '[{"type":"text","text":"x"}]', dm1);
      raise exception 'FAIL C1: % replies into the DM', v_txt;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  passed := passed || 'C1'::text;

  -- R1: reactions, totals, notifications ------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if not public.lounge_toggle_reaction(m1, 'heart') then raise exception 'FAIL R1: reaction not added'; end if;
  select reactions into v from public.lounge_messages where id = m1;
  if v <> '{"heart": 1}'::jsonb then raise exception 'FAIL R1: totals %', v; end if;
  begin
    perform public.lounge_toggle_reaction(m1, 'poop');
    raise exception 'FAIL R1: unknown reaction';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_notifications where user_id = a and kind = 'reaction' and message_id = m1;
  if v_cnt <> 1 then raise exception 'FAIL R1: reaction notification'; end if;
  select count(*) into v_cnt from public.lounge_reactions;
  if v_cnt <> 0 then raise exception 'FAIL R1: a reads someone else''s reactions'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if public.lounge_toggle_reaction(m1, 'heart') then raise exception 'FAIL R1: reaction not removed'; end if;
  select reactions into v from public.lounge_messages where id = m1;
  if v <> '{}'::jsonb then raise exception 'FAIL R1: totals after removal %', v; end if;
  passed := passed || 'R1'::text;

  -- O1: overview and read state ------------------------------------------------------------------
  -- b wrote in en-general (which reads it): start b's read state over.
  reset role;
  delete from public.lounge_room_states where user_id = b;
  perform set_config('role', 'authenticated', true);
  v := public.lounge_overview();
  select x into v from jsonb_array_elements(v -> 'channels') x where x ->> 'id' = 'en-general';
  if (v ->> 'unread')::int <> 1 or (v ->> 'mentions')::int <> 1 then raise exception 'FAIL O1: %', v; end if;
  perform public.lounge_mark_read(array['en-general'], '{}');
  select x into v from jsonb_array_elements(public.lounge_overview() -> 'channels') x where x ->> 'id' = 'en-general';
  if (v ->> 'unread')::int <> 0 then raise exception 'FAIL O1: still unread %', v; end if;
  select count(*) into v_cnt from public.lounge_notifications where user_id = b and kind = 'mention' and read_at is null;
  if v_cnt <> 0 then raise exception 'FAIL O1: mention still unread'; end if;
  perform public.lounge_set_muted('en-general', null, true);
  select x into v from jsonb_array_elements(public.lounge_overview() -> 'channels') x where x ->> 'id' = 'en-general';
  if not (v ->> 'muted')::boolean then raise exception 'FAIL O1: mute'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_room_states where user_id = b;
  if v_cnt <> 0 then raise exception 'FAIL O1: a reads b''s read state'; end if;
  begin
    perform public.lounge_set_muted(null, (select id from public.lounge_conversations limit 1), true);
  exception when invalid_parameter_value then raise exception 'FAIL O1: participant cannot mute the DM';
  end;
  perform public.lounge_read_notifications(null);
  select count(*) into v_cnt from public.lounge_notifications where user_id = a and read_at is null;
  if v_cnt <> 0 then raise exception 'FAIL O1: notifications still unread'; end if;
  passed := passed || 'O1'::text;

  -- S1: attachments ----------------------------------------------------------------------------------
  reset role;
  insert into storage.objects (bucket_id, name) values
    ('lounge-media', a || '/photo-1.jpg'),
    ('lounge-media', a || '/photo-2.jpg'),
    ('lounge-media', b || '/photo-b.jpg');
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_post_message('en-inspiration', null, '[]', null, jsonb_build_array(jsonb_build_object('path', b || '/photo-b.jpg')));
    raise exception 'FAIL S1: someone else''s file attached';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.lounge_post_message('en-inspiration', null, '[]', null, jsonb_build_array(jsonb_build_object('path', a || '/missing.jpg')));
    raise exception 'FAIL S1: missing file attached';
  exception when invalid_parameter_value then null;
  end;
  perform public.lounge_post_message('en-inspiration', null, '[]', null,
    jsonb_build_array(jsonb_build_object('path', a || '/photo-1.jpg', 'alt', 'Gold heart')));
  perform public.lounge_post_message(null, b, '[{"type":"text","text":"for you"}]', null,
    jsonb_build_array(jsonb_build_object('path', a || '/photo-2.jpg')));
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from storage.objects where bucket_id = 'lounge-media' and name = a || '/photo-1.jpg';
  if v_cnt <> 1 then raise exception 'FAIL S1: channel image unreadable'; end if;
  select count(*) into v_cnt from storage.objects where bucket_id = 'lounge-media' and name = a || '/photo-2.jpg';
  if v_cnt <> 0 then raise exception 'FAIL S1: DM image readable by a third party'; end if;
  select count(*) into v_cnt from public.lounge_message_attachments where storage_path = a || '/photo-2.jpg';
  if v_cnt <> 0 then raise exception 'FAIL S1: DM attachment row readable by a third party'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from storage.objects where bucket_id = 'lounge-media' and name = a || '/photo-2.jpg';
  if v_cnt <> 1 then raise exception 'FAIL S1: recipient cannot read the DM image'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from storage.objects where bucket_id = 'lounge-media' and name = a || '/photo-1.jpg';
  if v_cnt <> 0 then raise exception 'FAIL S1: outsider reads lounge images'; end if;
  select count(*) into v_cnt from public.lounge_messages;
  if v_cnt <> 0 then raise exception 'FAIL S1: outsider reads messages'; end if;
  passed := passed || 'S1'::text;

  -- L1: losing the course closes the lounge ---------------------------------------------------------
  reset role;
  update public.course_entitlements set revoked_at = now() where user_id = c;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  select count(*) into v_cnt from public.lounge_messages;
  if v_cnt <> 0 then raise exception 'FAIL L1: former member reads messages'; end if;
  begin
    perform public.lounge_post_message('en-general', null, '[{"type":"text","text":"x"}]');
    raise exception 'FAIL L1: former member posts';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.lounge_post_message(null, c, '[{"type":"text","text":"x"}]');
    raise exception 'FAIL L1: DM to a former member';
  exception when invalid_parameter_value then null;
  end;
  select count(*) into v_cnt from public.lounge_directory() d where d.user_id = c and not d.active;
  if v_cnt <> 1 then raise exception 'FAIL L1: former member not flagged inactive'; end if;
  passed := passed || 'L1'::text;

  -- T1: rate limit --------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  v_ok := false;
  begin
    for i in 1..25 loop
      perform public.lounge_post_message('en-business', null, jsonb_build_array(jsonb_build_object('type', 'text', 'text', 'spam ' || i)));
    end loop;
  exception when sqlstate 'PT429' then v_ok := true;
  end;
  if not v_ok then raise exception 'FAIL T1: no rate limit'; end if;
  passed := passed || 'T1'::text;

  reset role;
  raise exception 'ALL LOUNGE TESTS PASSED (%)', array_to_string(passed, ', ');
end;
$$;
