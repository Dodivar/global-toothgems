-- =============================================================================
-- Glowbook artist directory validation suite (decision 145)
-- (migration 20261114103327_glowbook_artist_directory)
-- =============================================================================
--   D1  anon reads a listed artist: an approved page, opted in, Glowbook plan,
--       with a place and an approved creation — only what the page shows
--       (no user id, no e-mail), an area as rounded by the database;
--   D2  not listed: opted out, page waiting for moderation, plan expired, no
--       place, no approved creation; and anon still cannot read those rows
--       from the table itself;
--   D3  the badge only when the artist shows it;
--   D4  the switch: anon cannot call it, a member without a Glowbook is
--       refused, the artist joins and leaves (their own row only).
--
-- ONE transaction, ALWAYS rolled back by raising `ALL GLOWBOOK DIRECTORY TESTS PASSED`
-- (or `FAIL: ...`).
-- =============================================================================

do $$
declare
  listed   uuid := '00000000-0000-4000-a000-000000b60001';
  optout   uuid := '00000000-0000-4000-a000-000000b60002';
  pending  uuid := '00000000-0000-4000-a000-000000b60003';
  expired  uuid := '00000000-0000-4000-a000-000000b60004';
  noplace  uuid := '00000000-0000-4000-a000-000000b60005';
  noitem   uuid := '00000000-0000-4000-a000-000000b60006';
  member   uuid := '00000000-0000-4000-a000-000000b60007';
  v_scene  jsonb := jsonb_build_object('version', 2, 'model', 'dentition', 'pieces', '[]'::jsonb, 'groups', '[]'::jsonb);
  v_user   uuid;
  v_cre    uuid;
  v_j      jsonb;
  v_e      jsonb;
  v_cnt    int;
  v_state  text;
  v_row    public.studio_showcases;
  v_course uuid;
begin
  insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  select u, 'authenticated', 'authenticated', 'dir-' || right(u::text, 4) || '.test@example.invalid', now(), now(), now()
    from unnest(array[listed, optout, pending, expired, noplace, noitem, member]) u;
  insert into public.studio_subscriptions (user_id, plan, status, stripe_subscription_id, current_period_end)
  select u, 'atelier', 'active', 'sub_dir_' || right(u::text, 4), now() + interval '1 month'
    from unnest(array[listed, optout, pending, expired, noplace, noitem]) u;

  insert into public.studio_showcases (user_id, handle, display_name, bio, location, status, in_directory,
                                       place_mode, place_label, place_lat, place_lng) values
    (listed,  'dir-listed',  'Dir Listed',  'Hello', 'Paris', 'approved', true,  'area',  'Batignolles, Paris', 48.88, 2.32),
    (optout,  'dir-optout',  'Dir Optout',  '',      'Paris', 'approved', false, 'exact', '1 rue de Test, Paris', 48.85661, 2.35222),
    (pending, 'dir-pending', 'Dir Pending', '',      'Lyon',  'pending',  true,  'exact', '2 rue de Test, Lyon', 45.76404, 4.83566),
    (expired, 'dir-expired', 'Dir Expired', '',      'Lille', 'approved', true,  'exact', '3 rue de Test, Lille', 50.62925, 3.05726),
    (noitem,  'dir-noitem',  'Dir Noitem',  '',      'Nice',  'approved', true,  'exact', '4 rue de Test, Nice', 43.70313, 7.26608);
  insert into public.studio_showcases (user_id, handle, display_name, status, in_directory) values
    (noplace, 'dir-noplace', 'Dir Noplace', 'approved', true);

  -- One approved creation each, except noitem (pending only).
  foreach v_user in array array[listed, optout, pending, expired, noplace, noitem] loop
    insert into public.creations (user_id, name, scene_data, thumbnail_path)
    values (v_user, 'Look', v_scene, v_user || '/look.jpg') returning id into v_cre;
    insert into public.studio_showcase_items (user_id, creation_id, status)
    values (v_user, v_cre, case when v_user = noitem then 'pending' else 'approved' end);
  end loop;
  update public.studio_subscriptions set status = 'canceled', current_period_end = now() - interval '1 second'
   where user_id = expired;

  -- D1
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_j := public.glowbook_directory();
  if jsonb_typeof(v_j) <> 'array' then raise exception 'FAIL D1: not an array (%)', v_j; end if;
  select e into v_e from jsonb_array_elements(v_j) e where e ->> 'handle' = 'dir-listed';
  if v_e is null then raise exception 'FAIL D1: the listed artist is missing (%)', v_j; end if;
  if v_e ->> 'display_name' <> 'Dir Listed' or v_e ->> 'location' <> 'Paris'
     or v_e #>> '{place,mode}' <> 'area' or (v_e #>> '{place,lat}')::numeric <> 48.88
     or (v_e ->> 'creation_count')::int <> 1 or v_e ->> 'cover_path' <> listed || '/look.jpg' then
    raise exception 'FAIL D1: wrong entry %', v_e;
  end if;
  if v_e ? 'user_id' or v_j::text like '%example.invalid%' or v_j::text like '%sub_dir_%' then
    raise exception 'FAIL D1: more than the page shows (%)', v_e;
  end if;

  -- D2
  select count(*) into v_cnt from jsonb_array_elements(v_j) e
   where e ->> 'handle' in ('dir-optout', 'dir-pending', 'dir-expired', 'dir-noplace', 'dir-noitem');
  if v_cnt <> 0 then raise exception 'FAIL D2: % unlisted artist(s) shown (%)', v_cnt, v_j; end if;
  v_cnt := 0;
  begin
    select count(*) into v_cnt from public.studio_showcases
     where user_id in (optout, pending, expired, noplace, noitem);
  exception when insufficient_privilege then v_cnt := 0;
  end;
  if v_cnt <> 0 then raise exception 'FAIL D2: anon reads % Glowbook row(s) directly', v_cnt; end if;
  -- The expired artist comes back with the plan, without touching the switch.
  execute 'reset role';
  update public.studio_subscriptions set status = 'active', current_period_end = now() + interval '1 month'
   where user_id = expired;
  perform set_config('role', 'anon', true);
  if not exists (select 1 from jsonb_array_elements(public.glowbook_directory()) e where e ->> 'handle' = 'dir-expired') then
    raise exception 'FAIL D2: the renewed artist is still missing';
  end if;

  -- D3: no certificate → no badge; a certificate → the badge while the artist shows it.
  if (v_e ->> 'certified')::boolean then raise exception 'FAIL D3: badge without a certificate'; end if;
  execute 'reset role';
  insert into public.courses (slug, title) values ('dir-test-cert-course-990002', 'Pose experte DIR test') returning id into v_course;
  insert into public.course_completions (user_id, course_id, min_score, certificate_code) values
    (listed, v_course, 70, 'GTC-98AA-98BB-98CC');
  perform set_config('role', 'anon', true);
  select e into v_e from jsonb_array_elements(public.glowbook_directory()) e where e ->> 'handle' = 'dir-listed';
  if (v_e ->> 'certified')::boolean is not true then raise exception 'FAIL D3: certified artist without the badge (%)', v_e; end if;
  execute 'reset role';
  update public.studio_showcases set show_certification = false where user_id = listed;
  perform set_config('role', 'anon', true);
  select e into v_e from jsonb_array_elements(public.glowbook_directory()) e where e ->> 'handle' = 'dir-listed';
  if (v_e ->> 'certified')::boolean then raise exception 'FAIL D3: hidden badge shown'; end if;

  -- D4
  v_state := null;
  begin
    perform public.studio_set_showcase_directory(true);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '42501' then raise exception 'FAIL D4: anon used the switch (%)', v_state; end if;
  execute 'reset role';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', member, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_set_showcase_directory(true);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from 'P0002' then raise exception 'FAIL D4: a member without a Glowbook joined (%)', v_state; end if;
  perform set_config('request.jwt.claims', json_build_object('aal', 'aal2', 'sub', optout, 'role', 'authenticated')::text, true);
  v_state := null;
  begin
    perform public.studio_set_showcase_directory(null);
  exception when others then v_state := sqlstate;
  end;
  if v_state is distinct from '22023' then raise exception 'FAIL D4: null accepted (%)', v_state; end if;
  v_row := public.studio_set_showcase_directory(true);
  if not v_row.in_directory or v_row.user_id <> optout then raise exception 'FAIL D4: not joined'; end if;
  if not exists (select 1 from jsonb_array_elements(public.glowbook_directory()) e where e ->> 'handle' = 'dir-optout') then
    raise exception 'FAIL D4: joined but not listed';
  end if;
  v_row := public.studio_set_showcase_directory(false);
  if v_row.in_directory then raise exception 'FAIL D4: not left'; end if;
  execute 'reset role';
  if (select in_directory from public.studio_showcases where user_id = listed) is not true then
    raise exception 'FAIL D4: another artist''s switch changed';
  end if;
  perform set_config('role', 'anon', true);
  if exists (select 1 from jsonb_array_elements(public.glowbook_directory()) e where e ->> 'handle' = 'dir-optout') then
    raise exception 'FAIL D4: left but still listed';
  end if;
  execute 'reset role';

  raise exception 'ALL GLOWBOOK DIRECTORY TESTS PASSED';
end;
$$;
